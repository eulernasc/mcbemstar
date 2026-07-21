# MC Bem Estar Studio

Sistema de agendamento responsivo para celular, tablet, iPad e computador.

## Principais recursos

- escolha do profissional antes do serviço;
- foto editável do profissional pelo painel;
- horários de início a cada 30 minutos;
- duração real do serviço bloqueando sobreposições;
- horários diferentes por dia da semana;
- painel administrativo responsivo;
- agenda visual em formato de calendário semanal ou diário;
- cores por status: aguardando, confirmado, remarcando, concluído e cancelado;
- central de confirmações do WhatsApp;
- relatório financeiro em PDF;
- estrutura pronta para a WhatsApp Cloud API.

## Publicação do site

Envie todos os arquivos e pastas para a raiz do repositório do GitHub Pages.

Arquivos públicos principais:

- `index.html`
- `admin.html`
- `agendamento.html`
- `assets/`
- `css/`
- `js/`

A pasta `functions/`, o `firebase.json` e o `.firebaserc` são usados para implantar o backend do WhatsApp no Firebase, não pelo GitHub Pages.

## Agenda

O painel possui dois modos:

- **Semana:** colunas de segunda a sábado e linha do tempo vertical;
- **Dia:** uma coluna ampliada, recomendada para celulares.

Os blocos ocupam a altura proporcional à duração do serviço.

## Horários padrão

- Segunda a quarta: 07:00 às 19:00
- Quinta e sexta: 07:00 às 22:00
- Sábado: 07:00 às 14:00
- Domingo: fechado

Tudo pode ser alterado na aba **Horários**.

## WhatsApp

A interface e o backend estão preparados para:

- enviar confirmação somente ao cliente;
- receber Confirmar, Remarcar ou Cancelar;
- atualizar a agenda automaticamente;
- fornecer uma página segura para o cliente escolher outro horário.

A integração só começa a enviar mensagens depois da configuração da Meta e da implantação das Cloud Functions. Veja `WHATSAPP-SETUP.md`.

## Firebase

O projeto usa:

- Firestore;
- Firebase Authentication;
- Cloud Functions para a API do WhatsApp.

Publique o conteúdo de `firestore.rules` no Firestore. Para as Functions, o projeto precisa estar no plano Blaze.
