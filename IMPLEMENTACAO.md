# Alterações do hepso.md — 11/11/2026

Aplicadas no checkout local, sem publicar ou enviar e-mails.

- Removida a seção de princípios (01–05) e os parceiros `interprise-icons/6.jpg` e `7.jpg` das duas cópias da faixa.
- `#sobre` contém apenas o vídeo em loop, com carregamento ao se aproximar da tela.
- Títulos de produtos usam `clamp(46px,5.4vw,66px)` nas páginas de soluções.
- Carrossel de etapas da Empresa usa grupos com espaçamento próprio, rolagem nativa, navegação por botões, teclado e arraste. Os botões ficam fora da área de arraste. Nenhuma ação dos cards ou do carrossel altera o vídeo.
- Conteúdo de soluções especiais removido da página Racks e reunido em `/produtos/projetos-especiais/`, com os modelos customizado, híbrido e Edge. O endereço antigo redireciona; há fallback HTML para servidores sem Apache.
- Menus de todas as páginas incluem Projetos avançados e seus modelos, com submenu para mouse, teclado e menu móvel.
- Fale Conosco substituído por Trabalhe Conosco. A página Contato mantém os canais comerciais e oferece o novo formulário de currículo em PDF.
- Logo de 25 anos aplicada ao cabeçalho e rodapé. Original preservado e versão WebP gerada.
- Imagens locais utilizadas receberam dimensões, carregamento adequado e versões WebP quando houve redução relevante: 9 imagens, de 1.384.517 para 217.418 bytes, economia de aproximadamente 84% nesses arquivos.
- Removidas chamadas duplicadas de fontes e carregamento incondicional do Google Analytics. GA passa a respeitar consentimento. A telemetria automática de visitas foi desativada no cliente.
- Corrigidos dados estruturados, imagem social, breadcrumbs e sitemap; removida a busca fictícia e a rota inexistente Hepso-EPI do sitemap.
- Adicionados foco visível, link para conteúdo, suporte a movimento reduzido e configurações Apache para compressão/cache e bloqueio de arquivos internos.

## Endereço e CNPJ

O art. 2º do Decreto 7.962/2013 exige identificação do fornecedor, CPF/CNPJ quando houver, e endereço físico/eletrônico nos meios usados para oferta ou conclusão de contratos de consumo. A LGPD, art. 9º, exige transparência sobre o controlador e contato; não é uma regra geral de publicação de CNPJ no rodapé de qualquer site.

Como o site apresenta produtos e solicitações comerciais, foi mantido o endereço já existente. O número 760 consta na própria página Contato. Não foi inventado um CNPJ ou uma razão social: esses dados não constam no checkout e foram solicitados ao responsável. A identificação deve ser completada quando forem fornecidos.

Fontes oficiais:
- https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

## Ativação do envio de currículos na hospedagem

O novo endpoint é `api/careers.php`, com PHP 8.1 ou posterior, sessões e extensão Fileinfo. Usa a cópia de PHPMailer já presente no projeto.

1. Definir no ambiente do PHP as variáveis de `api/careers.env.example`: SMTP com senha real, e-mail do recrutamento e origem pública exata (sem barra final). O arquivo de exemplo não é carregado automaticamente e não deve receber segredos no repositório.
2. Disponibilizar ClamAV com assinaturas atualizadas. O PHP precisa de acesso ao socket configurado em `HEPSO_CLAMAV_SOCKET`; padrão `unix:///run/clamav/clamd.ctl`. Também aceita apenas TCP de loopback, como `tcp://127.0.0.1:3310`. Ajustar o limite de INSTREAM do ClamAV para mais de 5 MB. Se o scanner falhar, o envio é recusado.
3. Usar HTTPS. Em proxy reverso, configurar o servidor para informar HTTPS ao PHP de forma confiável. Não se confia em cabeçalhos arbitrários enviados pelo visitante.
4. Configurar `upload_max_filesize = 5M`, `post_max_size = 6M`, `max_file_uploads = 1` e timeout suficiente para a verificação e o SMTP. O diretório temporário do PHP deve estar fora da raiz pública. Limitar também corpo da requisição no servidor web.
5. Restringir o acesso à caixa postal de recrutamento e definir rotina de exclusão dos currículos após a finalidade do processo seletivo. O endpoint não cria um banco de currículos nem grava cópias públicas. O temporário é removido pelo PHP ao concluir a requisição.
6. Em Nginx, replicar as regras de `.htaccess`: bloquear arquivos internos/dotfiles, fontes de documentação e dependências PHP; configurar compressão/cache e redirecionamento do endereço antigo. Apache precisa permitir as diretivas usadas e ter os módulos correspondentes.

Validações do upload: token CSRF com sessão, origem, limite por IP com arquivo bloqueado durante atualização, honeypot, consentimento obrigatório, validação de campos, tamanho real, extensão, MIME identificado no servidor, assinatura e término do PDF, recusa de indicadores de PDF ativo/criptografado e varredura antivírus obrigatória. O nome do anexo é fixo (`curriculo.pdf`), o conteúdo vai em e-mail de texto e as credenciais vêm do ambiente. Nenhum endereço arbitrário recebe mensagens. Esses controles não garantem ausência de todos os ataques possíveis; o PDF não é reescrito ou desarmado por uma ferramenta CDR.

## GEO e PageSpeed

As boas práticas de SEO seguem válidas para resultados com IA; não existe marcação especial que garanta inclusão. Foram melhorados conteúdo acessível, links, identidade consistente, dados estruturados coerentes e desempenho local.

Referência oficial: https://developers.google.com/search/docs/appearance/ai-features

Nenhuma nota 100 foi prometida ou medida. PageSpeed depende da URL publicada, TTFB, configuração do servidor, cache, terceiros e condições de execução. Os vídeos continuam disponíveis no formato original. Fazer uma única medição na URL publicada após o deploy é o próximo passo para identificar qualquer gargalo real restante.

## Verificações realizadas

Verificação estática das páginas, links/recursos locais, JSON-LD, JavaScript e análise sintática do novo PHP. Conferência pontual no navegador do carrossel e das páginas alteradas. Não foram usados testes de carga, varreduras extensas ou envio real de currículos/e-mails.

O ambiente local não possui um executável PHP nem o serviço ClamAV configurado. O fluxo de envio por SMTP precisa ser conferido na hospedagem após a configuração; a análise sintática não substitui essa integração. As configurações SMTP antigas de `send.php` e `track-visit.php` já continham senha de exemplo e não foram substituídas por credenciais.

## Correção de escopo

A página `/produtos/` permanece com os dois cards de Racks e Acessórios. Foram removidos o terceiro card de Projetos Especiais, a seção extra de perguntas e suas marcações. O acesso à página de Projetos Especiais fica no menu Soluções.

## Títulos e acompanhamento das imagens

Títulos principais e de seção de todas as páginas usam `clamp(46px,5.4vw,66px)`. O acompanhamento antes restrito aos racks foi compartilhado com Acessórios, Kits, Projetos Especiais, Empresa e Catálogo: a mídia acompanha a rolagem quando o texto ao lado é mais alto. O movimento termina no limite da própria seção e é desativado quando as colunas passam a ficar empilhadas. O cálculo é atualizado quando fontes, mídias ou tamanho da janela alteram as dimensões, sem processamento contínuo durante a rolagem.

Os vídeos das seções iniciam automaticamente, sem som, ao entrar na área visível. A preparação do arquivo pode ocorrer antes, mas o início automático aguarda a visibilidade. Os controles permanecem disponíveis e o carrossel não interfere na reprodução.
