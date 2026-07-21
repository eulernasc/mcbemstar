# MC Bem Estar Studio

Sistema de agendamento responsivo, com foco em celular, tablet, iPad e computador.

## Publicação no GitHub Pages

Envie todos os arquivos e pastas para a raiz do repositório:

- `index.html`
- `admin.html`
- `assets/`
- `css/`
- `js/`
- `firestore.rules.example`

## Fluxo do cliente

1. Escolhe o profissional.
2. Escolhe o serviço.
3. Informa nome e WhatsApp.
4. Seleciona data e horário.
5. Confirma o agendamento.

O projeto começa com **Maykon Castro**, usando `assets/maykon-castro.webp`.

## Horários

Os horários iniciais já estão configurados assim:

- Segunda, terça e quarta: **07:00 às 19:00**
- Quinta e sexta: **07:00 às 22:00**
- Sábado: **07:00 às 14:00**
- Domingo: fechado

No painel administrativo, cada dia possui seu próprio botão de ativação, horário de abertura e horário de fechamento. Tudo pode ser alterado posteriormente.

Os inícios são oferecidos de 30 em 30 minutos: 07:00, 07:30, 08:00, 08:30 e assim por diante. A duração real do serviço continua sendo respeitada. Exemplo: um atendimento de 45 minutos às 07:00 bloqueia o início das 07:30 e libera novamente às 08:00.

## Painel administrativo

O painel fica em `admin.html` e exige o usuário cadastrado no Firebase Authentication.

No primeiro acesso:

1. Em **Profissionais**, clique em **Cadastrar Maykon** para gravar o profissional padrão no Firestore.
2. Em **Serviços**, clique em **Importar catálogo**.
3. Em **Horários**, ajuste dias, abertura e fechamento. A grade de início permanece em 30 minutos.

O painel possui Agenda, Profissionais, Serviços, Horários, Financeiro, DRE e Relatório.

## WhatsApp

O site não abre mais uma mensagem para o proprietário.

Cada agendamento salva:

- `whatsappDestino`: telefone do cliente;
- `whatsappConfirmacaoStatus`: `pendente_api`.

Esses campos estão preparados para a futura integração com a API oficial do WhatsApp, que enviará a confirmação somente ao cliente.

## Firebase

O projeto utiliza:

- Firestore para profissionais, serviços, configurações, agenda e financeiro;
- Firebase Authentication para o painel administrativo.

Copie o conteúdo de `firestore.rules.example` para as regras do Firestore antes de colocar a nova versão em produção.

## Foto dos profissionais
Na aba **Profissionais**, clique em **Editar** ou **+ Novo Profissional** e use **Escolher foto**. O painel aceita JPG, PNG e WEBP, comprime a imagem automaticamente e salva junto ao cadastro no Firestore. Não é necessário configurar o Firebase Storage para esta versão.
