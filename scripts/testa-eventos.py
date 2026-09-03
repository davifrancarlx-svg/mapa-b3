"""Testes offline do recorte IPE, sem consultar documentos ou a rede."""

import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("eventos", Path(__file__).with_name("atualiza-eventos.py"))
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)
HOJE = date(2026, 1, 10)
BASE = [{"cod": "TEST", "cnpj": "00123456000199"}]
URL = "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numProtocolo=1&numVersao=1"


def linha(protocolo="1", versao="1", dia=HOJE):
    return {"CNPJ_Companhia": "00.123.456/0001-99", "Categoria": "Fato Relevante", "Data_Entrega": dia.isoformat(),
            "Protocolo_Entrega": protocolo, "Versao": versao, "Assunto": "Mesmo assunto", "Tipo": "Tipo original",
            "Link_Download": URL + "&p=" + protocolo + "&v=" + versao}


class EventosTest(unittest.TestCase):
    def gera(self, linhas):
        return ev.gera(linhas, BASE, HOJE, ["https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2026.zip"])

    def test_identidade_e_limite(self):
        r = self.gera([linha(), linha(), linha("2"), linha("1", "2")])
        self.assertEqual(r["documentosExibidos"], 3)
        r = self.gera([linha(str(n)) for n in range(12)])
        self.assertEqual(len(r["eventos"]["TEST"]), 8)
        self.assertEqual(r["totaisPorEmpresa"]["TEST"], 12)
        self.assertEqual(r["documentosNoRecorte"], 12)

    def test_janela_inclusiva_e_categorias(self):
        r = self.gera([linha("inicio", dia=HOJE-timedelta(days=179)), linha("fora", dia=HOJE-timedelta(days=180)),
                       linha("futuro", dia=HOJE+timedelta(days=1)), linha("fim"), {**linha("outra"), "Categoria": "Assembleia"}])
        self.assertEqual(r["documentosExibidos"], 2)
        self.assertEqual(r["janela"]["inicio"], (HOJE-timedelta(days=179)).isoformat())
        self.assertEqual(r["eventos"]["TEST"][0]["protocolo"], "fim")

    def test_links_e_metadados_invalidos(self):
        for u in ["https://falsocvm.gov.br/x", "https://cvm.gov.br.evil.test/x", "https://cvm.gov.br@evil.test/x", "http://cvm.gov.br/x", "javascript:alert(1)", "https://cvm.gov.br:444/x"]:
            self.assertFalse(ev.oficial(u), u)
            with self.assertRaises(ValueError):
                self.gera([{**linha(), "Link_Download": u}])
        self.assertTrue(ev.oficial(URL))
        with self.assertRaises(ValueError):
            self.gera([{**linha(), "Data_Entrega": "2026-02-30"}])
        with self.assertRaises(ValueError):
            self.gera([linha(versao="0")])
        self.assertIsNone(ev.limpacnpj(""))
        self.assertEqual(self.gera([{**linha(), "CNPJ_Companhia": ""}])["documentosExibidos"], 0)

    def test_link_como_identidade_alternativa(self):
        a = {"url": "https://www.rad.cvm.gov.br/x?a=1&b=2", "protocolo": None}
        b = {"url": "https://www.rad.cvm.gov.br/x?b=2&a=1", "protocolo": None}
        self.assertEqual(ev.identidade(a), ev.identidade(b))

    def test_zip_e_schema(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("leia-me.txt", "Nao e o CSV")
            z.writestr("ipe_cia_aberta_2026.csv", (";".join(sorted(ev.COLUNAS)) + "\n").encode("cp1252"))
        self.assertEqual(list(ev.linhas_zip(buf.getvalue(), 2026)), [])
        with self.assertRaises(ValueError):
            list(ev.linhas_zip(buf.getvalue(), 2025))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("ipe_cia_aberta_2026.csv", "campo_errado\nvalor\n")
        with self.assertRaises(ValueError):
            list(ev.linhas_zip(buf.getvalue(), 2026))

    def test_guardas_e_falha_sem_sobrescrita(self):
        anterior = {"eventos": {"TEST": [linha()] * 8}}
        with self.assertRaises(ValueError):
            ev.confere_queda({"documentosExibidos": 0}, None)
        with self.assertRaises(ValueError):
            ev.confere_queda({"documentosExibidos": 3}, anterior)
        with tempfile.TemporaryDirectory() as pasta:
            raiz = Path(pasta)
            original = json.dumps(anterior)
            (raiz / "eventos.json").write_text(original, encoding="utf-8")
            (raiz / "index.html").write_text("const D = " + json.dumps({"empresas": BASE}), encoding="utf-8")
            with patch.object(ev, "RAIZ", raiz), patch.object(ev.urllib.request, "urlopen", side_effect=OSError("sem rede")), redirect_stdout(io.StringIO()):
                with self.assertRaises(OSError):
                    ev.main()
            self.assertEqual((raiz / "eventos.json").read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
