# Biblioteca OTSS

Nova página da Biblioteca do site [otss.org.br](https://www.otss.org.br): busca global, abas por tipo, cores por eixo temático, tecnologias sociais, vídeos (YouTube OTSS Bocaina), podcast (Vozes do Território) e envio de publicações com upload de arquivo.

Tudo vem do **CMS do Wix** em tempo real. Item novo no CMS aparece na página sozinho, sem mexer no código.

- Componente: [`src/biblioteca.js`](src/biblioteca.js) (Web Component `<otss-biblioteca>`, JavaScript puro, sem build)
- Prévia: `index.html` (publicada no GitHub Pages)

---

## Como instalar no Wix Studio

1. No editor, crie uma página em branco (por exemplo **Biblioteca (nova)**, URL `/biblioteca-nova`). A página atual `/biblioteca` continua como está.
2. Adicione **Elemento personalizado** (Adicionar → Incorporar código → Elemento personalizado).
3. Em **Escolher fonte**, selecione **URL do servidor** e cole:
   `https://tiepassos.github.io/otss-biblioteca/src/biblioteca.js`
4. Em **Nome da tag**, coloque: `otss-biblioteca`
5. Estique o elemento na largura toda da página e defina a altura como **automática** (se não houver essa opção, use uma altura grande, como 4000 px).
6. Opcional: se o cabeçalho do site ficar fixo por cima das abas, adicione o atributo `sticky-offset` com a altura do cabeçalho em pixels (ex.: `80`).
7. Publique. Depois de validar, troque os links do menu de `/biblioteca` para a página nova (ou renomeie as URLs).

> Elementos personalizados exigem plano Premium com domínio conectado. O site já tem os dois.

---

## Coleções no CMS (todas novas; as originais não foram alteradas)

| Coleção | Para que serve |
|---|---|
| **Biblioteca · Acervo** (`BibliotecaAcervo`) | Publicações, livros, capítulos, artigos, teses, eventos, cadernos |
| **Biblioteca · Tipos (abas)** (`BibliotecaTipos`) | Cada item vira uma aba, com nome, cor e ordem |
| **Biblioteca · Temas (áreas e eixos)** (`BibliotecaTemas`) | 17 áreas de atuação; a cor do eixo identifica cada tema |
| **Biblioteca · Tecnologias Sociais** (`BibliotecaTecnologias`) | Cópia da Biblioteca de Tecnologias Sociais |
| **Biblioteca · Vídeos e Podcast** (`BibliotecaMidia`) | Vídeos e playlists do YouTube, episódios do Spotify |
| **Biblioteca · Submissões recebidas** (`BibliotecaSubmissoes`) | Reserva (não usada; as submissões chegam pelo Wix Forms) |

As submissões chegam no formulário **“Biblioteca · Submissão de publicação”** (Painel → Formulários e envios), com os arquivos anexados.

### Adicionar uma publicação
1. CMS → **Biblioteca · Acervo** → Adicionar item.
2. Preencha **Título**, **Tipo (aba)**, **Autoria**, **Ano** e, se tiver, **Referência (ABNT)**, que alimenta o botão “Copiar referência”.
3. Para o PDF, use **Arquivo (upload PDF)** (o arquivo fica no próprio Wix) ou **Link externo** (Drive, DOI).
4. Marque os **Temas / Áreas**. Eles dão a cor e alimentam o filtro.
5. **Destaque no topo** coloca o item no carrossel “Em destaque”.
6. **Visível no site** desmarcado esconde o item sem apagar.

### Como a página se organiza
- **Início**: destaques, resumo da produção acadêmica, tecnologias, multimídia e publicações.
- **Produção acadêmica**: histograma por ano (clique numa barra para filtrar), índice de autoras e autores, subabas por tipo e três modos de leitura: *Linha do tempo* (agrupada por ano ou tipo), *Referências* (ABNT, com “copiar todas”) e *Cards*.
- **Publicações OTSS**, **Tecnologias Sociais** e **Vídeos e Podcast**: cards ou lista.
- **Busca**: autocompletar com itens, autoria e temas. Pode buscar em tudo, só nos títulos ou só na autoria. A página de resultados agrupa por seção. Atalho: tecla `/`.

O índice de autoria é montado a partir do campo **Autoria** (nomes separados por `;`, no formato `SOBRENOME, Iniciais`). Quanto mais padronizado esse campo, mais preciso o índice.

### Criar uma aba nova
CMS → **Biblioteca · Tipos (abas)** → novo item com **Nome**, **Slug** (sem espaços, ex. `relatorios`), **Cor** (hex, ex. `#276CB2`), **Ordem**, **Seção** (`academico` ou `publicacoes`) e **Ativo** marcado. Depois é só escolher esse tipo nos itens do Acervo.

### Vídeos e podcast
CMS → **Biblioteca · Vídeos e Podcast** → novo item:
- **Tipo**: `video`, `playlist` ou `podcast`
- **Link**: URL do YouTube (vídeo ou playlist) ou do episódio no Spotify
- Título, descrição, data e temas

As 7 playlists temáticas do canal já estão cadastradas, mas com **Visível** desmarcado: hoje só 1 vídeo do canal é público. Quando os vídeos forem publicados no YouTube, basta marcar **Visível**.

---

## Desenvolvimento

Não tem build. Para ver localmente, sirva a pasta com qualquer servidor estático e abra `index.html`.

O componente usa um *client ID* OAuth público do Wix (aplicativo “Biblioteca OTSS (front-end)”) para ler o CMS como visitante anônimo. Só as coleções com leitura “Qualquer pessoa” ficam acessíveis. A coleção de submissões não é legível por visitantes.

Atributos opcionais do elemento: `client-id`, `form-id`, `site-id`, `sticky-offset`, `fonte-titulo`, `fonte-titulo-familia`.

### Fonte do título (Museo 900)
O título do hero usa **Museo 900**. A fonte é comercial e **não está no repositório**. Para aparecer para os visitantes do site, use um destes caminhos (com a licença de webfont da Museo):
1. **Arquivo no Wix:** suba o `.woff2` (ou `.otf`) da Museo 900 no Gerenciador de Mídia do Wix, copie a URL e adicione no Elemento personalizado o atributo `fonte-titulo` com essa URL.
2. **Fonte do site:** se a Museo 900 for enviada como fonte do site no Wix Studio, adicione o atributo `fonte-titulo-familia` com o nome da família que o Wix gerar.

Sem nenhum dos dois, o título usa a Museo 900 só se ela estiver instalada no computador de quem visita. Nos outros casos aparece a fonte reserva (Bitter 900).
