# Continuidade para Claude Code — melhorias da revisão B3

Pedido do autor em 21/09/2026: aplicar TODAS as melhorias sugeridas na revisão, documentando primeiro para permitir continuidade se o limite de uso terminar.

Leia AGENTS.md e REVISAO-2026-09-21.md. O diretório já tinha muitas alterações anteriores: NÃO usar reset/checkout para limpá-las. Não converter arquitetura, adicionar dependência, fazer mobile, commit/push/deploy ou regenerar dados sem necessidade. As correções críticas da revisão anterior já estão aplicadas. O relatório anterior registra o estado ANTES destas melhorias.

## Plano e estado (atualizar durante o trabalho)

- [x] Rótulos de FII: parametrizar spark(m, tipo), manter ajustado como padrão; chamada FII usa fechamento; corrigir fonte da ficha. Não mudar cálculo.
- [x] Foco: recuperar botão da Carteira/Favoritos por ticker quando lastFocus foi removido por render; manter travaFundo e foco original quando disponível; fallback seguro na seção.
- [x] CSV CVM: parser sem dependências para ponto e vírgula, aspas escapadas e quebras em campo; rejeitar aspas incompletas; testes em scripts/lib/zip.js.
- [x] Importação cifrada: validar versão 1, algoritmo, iterações compatíveis com arquivo atual (310000), salt 16 bytes, IV 12 bytes, base64 e limite de payload antes de WebCrypto; preservar senha errada/adulteração rejeitadas.
- [x] Números extremos: validar custo individual e soma de custos finitos na leitura/importação/formulário; impedir agregados falsos por overflow de preço atual; testar sem limitar arbitrariamente valores normais.
- [x] Tooltip: teste de navegador deve aguardar opacidade com prazo limitado, não medir no mesmo frame do focusin.
- [x] Rede: AbortSignal.timeout nos fetches de atualiza-precos.js e atualiza-analise.js; leitura JSON precisa ser aguardada dentro do try para retentativa; testes simulados sem baixar bases.
- [x] README: remover afirmação antiga de inexistência de metricas-etfs e esclarecer sincronização cifrada manual.
- [x] Prévia de restauração: invalidar confirmação se carteira mudou desde a prévia; também evitar respostas concorrentes de importação sobrescrevendo prévia mais recente.
- [x] Testar, registrar resultados e atualizar este arquivo.

## Validação

Node local v24.18.0; CI Node 20 com --experimental-websocket para navegador. Rode todos scripts/testa-*.js e scripts/valida-*.js. O testa-navegador.js sobe HTTP e Chrome headless automaticamente. Python: C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe -B scripts/testa-eventos.py.

Antes desta rodada: 26/27 scripts Node de lógica/dados passaram; valida-saude falhou por cinco bases acima de 96 horas (não mascarar). Python 6/6. Navegador original 29/30 por tooltip; cópia temporária aguardando animação 30/30. Cópia temporária já removida. Scripts de regressão da rodada anterior em scripts/testa-regressoes-revisao.js, já na CI.

Adicionar testes significativos para parser, importação e overflow, foco real com render substituindo origem, timeout/retry. Não executar milhares de coletas reais só para testar. Manter relatório de testes em JSON separado do anterior.

## Prompt para continuar

“Leia CONTINUIDADE-CLAUDE.md, AGENTS.md e REVISAO-2026-09-21.md em C:/Users/User/Desktop/B3. Continue os itens pendentes, confira o código antes de presumir que o checklist reflete a última edição, preserve todas as alterações existentes e execute os testes relevantes. O usuário autorizou aplicar todas as melhorias sugeridas; não é necessário reconfirmar. Não faça commit/push/deploy. Atualize o checklist e reporte o que passou e limitações.”

## Progresso intermediário

Implementadas as nove mudanças no código (incluindo prévia concorrente), ainda em validação ampliada. Carteira, criptografia, regressões anteriores e estrutura passaram. Teste original do tooltip agora passa. Novos testes desta rodada ainda serão acrescentados. Arquivos alterados: index.html, scripts/lib/zip.js, scripts/atualiza-precos.js, scripts/atualiza-analise.js, scripts/testa-navegador.js, scripts/testa-regressoes-revisao.js e README.md. Nenhuma base regenerada.

## Estado final — concluído nesta rodada

Todas as oito melhorias da tabela da revisão e a proteção adicional da prévia de restauração foram aplicadas. O checklist acima está concluído. O progresso intermediário anterior fica apenas como histórico.

- 27 de 28 scripts Node de lógica/dados passaram. Única reprovação: valida-saude.js por cinco bases antigas (>96h), já existente. Saída integral: melhorias-testes.json.
- Navegador real: 35/35 verificações passaram, sem erro no console. Inclui recuperação de foco em Carteira/Favoritos, destino alternativo quando origem desaparece e rótulos corretos de FII.
- Python: 6/6 testes passaram. git diff --check sem erros.
- Novo scripts/testa-melhorias-revisao.js incluído na CI: CSV com separadores/aspas/quebras, custos extremos, rejeição de parâmetros antes do WebCrypto, prévia alterada, duas importações fora de ordem, timeout e retry de leitura JSON.
- Não foram regeneradas bases nem executados workflows remotos. Não houve commit, push ou deploy.

### Decisões de implementação

Formato cifrado v1 continua AES-GCM com PBKDF2-SHA256, 310000 iterações, salt 16 bytes e IV 12 bytes. Parâmetros diferentes são rejeitados antes de derivar a chave. Limite de conteúdo claro: 1 MiB (mesmo limite na exportação e importação); base64 gerado em blocos para evitar estouro da pilha. Arquivos legítimos gerados pelo formato atual permanecem compatíveis dentro desse limite.

Custos individuais e soma precisam ser finitos. Dados salvos/importados com overflow são rejeitados com aviso, sem regravar o armazenamento. Overflow causado por cotação em totais mostra ausência, nunca retorno falso. Foco original é preservado em reabertura assíncrona e recuperado por ticker se o DOM foi substituído. CSV malformado falha explicitamente em vez de deslocar colunas. Fetches alterados têm prazo de 25 segundos.

### O que ainda cabe ao próximo agente, se solicitado

Não restou melhoria de código desta lista pendente. Para preparar publicação: verificar alterações preexistentes, rodar coleta real e confirmar saúde/CI no GitHub. Isso não foi executado nem está marcado como concluído. O relatório REVISAO-2026-09-21.md descreve o estado da revisão original; este arquivo descreve a conclusão posterior.
