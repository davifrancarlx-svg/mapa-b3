"""Gera eventos.json com documentos recentes de companhias brasileiras na CVM."""

import csv
import io
import json
import re
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = {"Fato Relevante", "Comunicado ao Mercado", "Calendário de Eventos Corporativos", "Aviso aos Acionistas"}


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
    return re.sub(r"\D", "", v or "").zfill(14)


def main():
    mapa = {limpacnpj(e.get("cnpj")): e["cod"] for e in empresas() if e.get("cnpj")}
    corte = date.today() - timedelta(days=180)
    urls = [f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{ano}.zip"
            for ano in range(corte.year, date.today().year + 1)]
    por = {}
    for url in urls:
        req = urllib.request.Request(url, headers={"User-Agent": "Mapa da B3/1.0 dados-publicos"})
        with urllib.request.urlopen(req, timeout=60) as r:
            bruto = r.read()
        with zipfile.ZipFile(io.BytesIO(bruto)) as z:
            texto = z.read(z.namelist()[0]).decode("cp1252")
        for row in csv.DictReader(io.StringIO(texto), delimiter=";"):
            cod = mapa.get(limpacnpj(row.get("CNPJ_Companhia")))
            if not cod or row.get("Categoria") not in CATEGORIAS:
                continue
            try:
                entrega = datetime.strptime(row["Data_Entrega"][:10], "%Y-%m-%d").date()
            except Exception:
                continue
            if entrega < corte:
                continue
            item = {"dt": entrega.isoformat(), "categoria": row["Categoria"], "tipo": row.get("Tipo") or None,
                    "assunto": row.get("Assunto") or row.get("Especie") or row["Categoria"], "url": row.get("Link_Download")}
            por.setdefault(cod, []).append(item)
    for cod, itens in por.items():
        unicos = {}
        for x in sorted(itens, key=lambda v: v["dt"], reverse=True):
            unicos.setdefault((x["categoria"], x["assunto"]), x)
        por[cod] = list(unicos.values())[:8]
    saida = {"atualizadoEm": datetime.now(timezone.utc).isoformat(), "fonte": urls,
             "metodologia": "Documentos IPE entregues nos ultimos 180 dias; links apontam para a CVM",
             "empresasComEventos": len(por), "eventos": por}
    (RAIZ / "eventos.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"gravado: {sum(map(len, por.values()))} documentos de {len(por)} empresas")


if __name__ == "__main__":
    main()
