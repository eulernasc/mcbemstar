# MC Bem Estar Studio

Sistema responsivo de agendamento com Firebase, painel administrativo, financeiro e confirmação automática pelo WhatsApp via Z-API.

## O que esta versão entrega

- O agendamento já nasce confirmado.
- Envio automático da confirmação pelo WhatsApp.
- Mensagem com dados do serviço, profissional, data e horário.
- Botões/links seguros para **Remarcar** e **Desmarcar**.
- Página do cliente para escolher outro horário disponível.
- Cancelamento libera o horário na agenda.
- Remarcação atualiza o mesmo agendamento e envia nova confirmação.
- Token aleatório protege o link enviado ao cliente.

## Publicação do site

Suba todos os arquivos para a raiz do repositório do GitHub Pages, preservando as pastas.

## Publicação das Functions

Os segredos já criados no projeto Firebase continuam sendo usados:

- `ZAPI_INSTANCE_ID`
- `ZAPI_INSTANCE_TOKEN`
- `ZAPI_CLIENT_TOKEN`

Depois de substituir os arquivos, execute `DEPLOYAR-FUNCTIONS.bat` ou rode:

```bash
npm --prefix functions install
firebase deploy --only functions
```

Projeto Firebase: `mc-bemestar`
Região: `southamerica-east1`
