"""Gera eventos.json com documentos recentes de companhias brasileiras na CVM."""

import csv
import io
import json
import re
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit

RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = {"Fato Relevante", "Comunicado ao Mercado", "Calendário de Eventos Corporativos", "Aviso aos Acionistas"}
LIMITE = 8
COLUNAS = {"CNPJ_Companhia", "Data_Entrega", "Categoria", "Link_Download", "Protocolo_Entrega", "Versao"}


def empresas():
    raw = (RAIZ / "index.html").read_text(encoding="utf-8")
    ini = raw.index("const D = ") + len("const D = ")
    nivel = 0
    texto = escape = False
    for i in range(ini, len(raw)):
        c = raw[i]
        if texto:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                texto = False
            continue
        if c == '"':
            texto = True
        elif c == "{":
            nivel += 1
        elif c == "}":
            nivel -= 1
            if nivel == 0:
                return json.loads(raw[ini:i + 1])["empresas"]


def limpacnpj(v):
    n = re.sub(r"\D", "", str(v or ""))
    return n.zfill(14) if 0 < len(n) <= 14 else None


def oficial(url):
    try:
        u = urlsplit(url)
        return (u.scheme == "https" and (u.hostname == "cvm.gov.br" or (u.hostname or "").endswith(".cvm.gov.br"))
                and not u.username and not u.password and u.port in (None, 443) and bool(u.path) and "\\" not in url)
    except (TypeError, ValueError):
        return False


def identidade(x):
    if x.get("protocolo"):
        return (x["protocolo"], x.get("versao"))
    u = urlsplit(x["url"])
    return (urlunsplit((u.scheme, u.netloc.lower(), u.path, urlencode(sorted(parse_qsl(u.query))), "")),)


def linhas_zip(bruto, ano):
    with zipfile.ZipFile(io.BytesIO(bruto)) as z:
        nome = f"ipe_cia_aberta_{ano}.csv"
        arquivos = [n for n in z.namelist() if Path(n).name == nome]
        if len(arquivos) != 1:
            raise ValueError(f"CSV esperado ausente ou ambiguo: {nome}")
        dados = z.read(arquivos[0])
    try:
        texto = dados.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = dados.decode("cp1252")
    leitor = csv.DictReader(io.StringIO(texto), delimiter=";")
    if not COLUNAS.issubset(leitor.fieldnames or []):
        raise ValueError("Colunas obrigatorias ausentes no IPE")
    yield from leitor


def gera(linhas, base, hoje, urls):
    mapa = {}
    for e in base:
        cnpj = limpacnpj(e.get("cnpj"))
        if cnpj and cnpj != "0" * 14:
            if cnpj in mapa and mapa[cnpj] != e["cod"]:
                raise ValueError("CNPJ ambiguo na base de empresas")
            mapa[cnpj] = e["cod"]
    corte = hoje - timedelta(days=179)
    por = {}
    for row in linhas:
        cod = mapa.get(limpacnpj(row.get("CNPJ_Companhia")))
        if not cod or row.get("Categoria") not in CATEGORIAS:
            continue
        entrega = date.fromisoformat(row["Data_Entrega"][:10])
        if not corte <= entrega <= hoje:
            continue
        url = (row.get("Link_Download") or "").strip()
        if not oficial(url):
            raise ValueError(f"{cod}: link fora do dominio oficial da CVM")
        versao = int(row["Versao"]) if row.get("Versao") else None
        if versao is not None and versao < 1:
            raise ValueError(f"{cod}: versao invalida")
        item = {"dt": entrega.isoformat(), "categoria": row["Categoria"], "tipo": row.get("Tipo") or None,
                "assunto": row.get("Assunto") or None, "especie": row.get("Especie") or None,
                "protocolo": (row.get("Protocolo_Entrega") or "").strip() or None, "versao": versao,
                "apresentacao": row.get("Tipo_Apresentacao") or None, "url": url}
        por.setdefault(cod, []).append(item)
    totais = {}
    for cod, itens in por.items():
        unicos = {}
        # Assuntos iguais nao identificam documentos: protocolos e versoes sim.
        for x in sorted(itens, key=lambda v: (v["dt"], v["protocolo"] or "", v["versao"] or 0, v["url"]), reverse=True):
            unicos.setdefault(identidade(x), x)
        totais[cod] = len(unicos)
        por[cod] = list(unicos.values())[:LIMITE]
    return {"versao": 2, "atualizadoEm": datetime.now(timezone.utc).isoformat(), "fonte": urls,
            "janela": {"inicio": corte.isoformat(), "fim": hoje.isoformat(), "dias": 180},
            "categorias": sorted(CATEGORIAS), "limitePorEmpresa": LIMITE, "totaisPorEmpresa": totais,
            "documentosNoRecorte": sum(totais.values()), "documentosExibidos": sum(map(len, por.values())),
            "metodologia": "Recorte por data de entrega, quatro categorias IPE; protocolo e versao preservados; ate 8 registros por empresa, sem resumo editorial",
            "empresasComEventos": len(por), "eventos": por}


def confere_queda(saida, anterior):
    novos = saida["documentosExibidos"]
    antigos = sum(map(len, (anterior or {}).get("eventos", {}).values()))
    if not novos or (antigos and novos < antigos * .5):
        raise ValueError("Base vazia ou queda superior a 50%; arquivo anterior preservado")


def main():
    hoje = datetime.now(timezone.utc).date()
    corte = hoje - timedelta(days=179)
    urls = [f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{ano}.zip"
            for ano in range(corte.year, hoje.year + 1)]

    def linhas():
        for url in urls:
            req = urllib.request.Request(url, headers={"User-Agent": "Mapa da B3/1.0 dados-publicos"})
            print("Consultando " + url, flush=True)
            with urllib.request.urlopen(req, timeout=60) as r:
                if not oficial(r.url):
                    raise ValueError("Redirecionamento fora da CVM")
                bruto = r.read()
            yield from linhas_zip(bruto, int(url[-8:-4]))

    destino = RAIZ / "eventos.json"
    anterior = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else None
    saida = gera(linhas(), empresas(), hoje, urls)
    confere_queda(saida, anterior)
    # So substitui a base depois de baixar todos os anos e validar o recorte.
    temporario = destino.with_suffix(".json.tmp")
    temporario.write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    temporario.replace(destino)
    por = saida["eventos"]
    print(f"gravado: {sum(map(len, por.values()))} documentos de {len(por)} empresas")


if __name__ == "__main__":
    main()
