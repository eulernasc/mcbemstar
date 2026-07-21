# MC Bem Estar Studio

Site de agendamento responsivo, com foco em celular.

## Publicação no GitHub Pages

Envie todos os arquivos e pastas deste projeto para a raiz do repositório:

- `index.html`
- `admin.html`
- `assets/`
- `css/`
- `js/`

## Primeiro acesso ao painel

1. Abra `admin.html`.
2. Entre com o usuário cadastrado no Firebase Authentication.
3. Em **Serviços**, clique em **Importar catálogo** para cadastrar os serviços informados pelo studio.
4. Em **Horários**, confira os dias de atendimento e ajuste abertura/fechamento. O padrão está em 07:00 às 19:00, com grade de 5 minutos.

## Funcionamento dos horários

O sistema considera a duração do serviço e os agendamentos já existentes. Exemplo: um atendimento iniciado às 07:00 com duração de 40 minutos bloqueia o período até 07:40, que passa a ser o próximo início possível.

## Firebase

O projeto mantém a configuração Firebase original do repositório:

- Firestore: serviços, configurações, agenda pública sem dados pessoais, agendamentos privados e financeiro.
- Authentication: acesso ao painel administrativo.

O número usado para finalizar a confirmação no WhatsApp está em `js/app.js`, na constante `WHATSAPP_STUDIO`.


## Regras do Firestore

O arquivo `firestore.rules.example` contém uma sugestão de regras que mantém nome e telefone dos clientes protegidos. Copie essas regras para o Firebase Console antes de colocar o sistema em produção.

## Lógica dos horários

Os horários públicos são calculados automaticamente pela duração do serviço e pelos agendamentos já ocupados. Exemplos:

- serviço de 60 minutos: 07:00, 08:00, 09:00...
- serviço de 45 minutos: 07:00, 07:45, 08:30...
- se um atendimento termina às 07:40, a próxima janela livre começa às 07:40.

O painel permanece separado em `admin.html` e exige autenticação.
