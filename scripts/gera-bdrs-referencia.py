"""
Extrai ativo lastro e paridade dos documentos oficiais do Banco B3.

O script e manual porque os documentos regulatórios mudam raramente. Ele usa
pdfplumber apenas durante a curadoria; o site continua sem dependencias.

Uso:
  python scripts/gera-bdrs-referencia.py
"""

import concurrent.futures
import html
import io
import json
import re
import time
import urllib.request
from pathlib import Path

from pypdf import PdfReader

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "bdrs-referencia.json"
PAGINA = "https://finservices.b3.com.br/bdr-nao-patrocinado/programas?delta=1000"
BASE = "https://finservices.b3.com.br"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36"


def baixa(url, tentativas=3):
    for n in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as resposta:
                return resposta.read()
        except Exception:
            if n == tentativas - 1:
                raise
            time.sleep(1.2 * (n + 1))


def programas():
    bruto = baixa(PAGINA).decode("utf-8", errors="replace")
    linhas = re.findall(r"<tr>(.*?)</tr>", bruto, re.S | re.I)
    saida = []
    for linha in linhas:
        nome = re.search(r'class="table-bdr__result-one"[^>]*>(.*?)</td>', linha, re.S | re.I)
        ticker = re.search(r'class="table-bdr__result-two"[^>]*>(.*?)</td>', linha, re.S | re.I)
        pdf = re.search(r'class="table-bdr__result-four-text"[^>]*href="([^"]+)', linha, re.S | re.I)
        if not (nome and ticker and pdf):
            continue
        limpo = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
        t = limpo(ticker.group(1)).replace("*", "").strip()
        if re.fullmatch(r"[A-Z0-9]{5,6}", t):
            saida.append({"ticker": t, "empresa": limpo(nome.group(1)), "fonte": BASE + pdf.group(1)})
    return saida


def campo(texto, padroes):
    for padrao in padroes:
        m = re.search(padrao, texto, re.I)
        if m:
            return " ".join(m.group(1).strip().split())
    return None


def extrai(item):
    try:
        bruto = baixa(item["fonte"])
        paginas = []
        pdf = PdfReader(io.BytesIO(bruto))
        for p in pdf.pages:
            texto = p.extract_text() or ""
            if "AÇÃO REPRESENTADA" in texto.upper() or "REPRESENTED SHARE" in texto.upper() or "AÇÃO LASTRO" in texto.upper():
                paginas.append(texto)
        texto = "\n".join(paginas)
        codigo = campo(texto, [
            r"C[oó]digo da A[cç][aã]o Representada:\s*([^\n]+)",
            r"Code of the Represented Share:\s*([^\n]+)",
            r"C[oó]digo do Ativo Lastro:\s*([^\n]+)",
        ])
        isin = campo(texto, [
            r"ISIN da A[cç][aã]o Representada:\s*([A-Z0-9]+)",
            r"ISIN code of the Represented Share:\s*([A-Z0-9]+)",
            r"C[oó]digo ISIN da A[cç][aã]o Representada:\s*([A-Z0-9]+)",
        ])
        bolsa = campo(texto, [
            r"Bolsa de Valores da A[cç][aã]o Representada:\s*([^\n]+)",
            r"Stock Exchange of the Represented Share:\s*([^\n]+)",
            r"Bolsa de Negocia[cç][aã]o[^:]*:\s*([^\n]+)",
        ])
        rel = re.search(r"(Rela[cç][aã]o BDR x (?:A[cç][aã]o|ADR|Ativo) Lastro|Parity BDR x (?:Underlying Share|ADR)|Paridade BDR[^:]*):\s*(\d+)\s*:\s*(\d+)", texto, re.I)
        if not rel:
            return item["ticker"], None, "paridade ausente"
        tipo_adr = "adr" in rel.group(1).lower()
        bdrs, acoes = int(rel.group(2)), int(rel.group(3))
        if tipo_adr:
            codigo_adr = campo(texto, [
                r"C[oó]digo de Negocia[cç][aã]o:\s*([A-Z0-9.\-]+)\s*\nAmbiente de Negocia[cç][aã]o",
                r"Trading Code:\s*([A-Z0-9.\-]+)\s*\nTrading Environment",
                r"C[oó]digo de Negocia[cç][aã]o do ADR:\s*([A-Z0-9.\-]+)",
            ])
            bolsa_adr = campo(texto, [
                r"Ambiente de Negocia[cç][aã]o:\s*([^\n]+)",
                r"Trading Environment:\s*([^\n]+)",
            ])
            if codigo_adr:
                codigo, isin = codigo_adr, None
            if bolsa_adr:
                bolsa = bolsa_adr
        if not codigo:
            return item["ticker"], None, "ativo lastro ausente"
        codigo = codigo.split()[0].strip(".;,()")
        return item["ticker"], {
            "ativo": codigo,
            "isinAtivo": isin,
            "bolsa": bolsa,
            "bdrs": bdrs,
            "acoes": acoes,
            "fator": round(acoes / bdrs, 10),
            "tipoLastro": "ADR" if tipo_adr else "acao",
            "fonte": item["fonte"],
        }, None
    except Exception as exc:
        return item["ticker"], None, str(exc)


def main():
    lista = programas()
    base = json.loads((RAIZ / "bdrs.json").read_text(encoding="utf-8"))
    tickers_ativos = {item["ticker"] for item in base["bdrs"]}
    lista = [item for item in lista if item["ticker"] in tickers_ativos]
    print(f"{len(lista)} programas encontrados no Banco B3", flush=True)
    anterior = {}
    if SAIDA.exists():
        anterior = json.loads(SAIDA.read_text(encoding="utf-8"))
    referencias = ({t: ref for t, ref in anterior.get("referencias", {}).items() if t in tickers_ativos}
                   if not anterior.get("completo", True) else {})
    falhas = {}
    pendentes = [item for item in lista if item["ticker"] not in referencias]

    def salva(completo):
        saida = {
            "geradoEm": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "fonte": PAGINA,
            "metodologia": "Ativo lastro, bolsa e relacao BDR por acao extraidos do descritivo operacional oficial de cada programa",
            "programasEncontrados": len(lista),
            "comReferencia": len(referencias),
            "completo": completo,
            "falhas": dict(sorted(falhas.items())),
            "referencias": dict(sorted(referencias.items())),
        }
        SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    feitos = len(referencias)
    # Extracao de texto e CPU-bound; processos evitam que o GIL serialize centenas de PDFs.
    with concurrent.futures.ProcessPoolExecutor(max_workers=6) as pool:
        futuros = [pool.submit(extrai, item) for item in pendentes]
        for futuro in concurrent.futures.as_completed(futuros):
            ticker, ref, erro = futuro.result()
            feitos += 1
            if ref:
                referencias[ticker] = ref
            else:
                falhas[ticker] = erro
            if feitos % 25 == 0:
                print(f"  {feitos}/{len(lista)} - {len(referencias)} extraidos", flush=True)
                salva(False)
    salva(True)
    print(f"gravado em {SAIDA}: {len(referencias)}/{len(lista)} com referencia", flush=True)


if __name__ == "__main__":
    main()
