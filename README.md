# Minhas Contas

App pessoal de gastos, receitas, orçamentos e lembretes. É um HTML que instala na tela inicial do celular,
**funciona sem internet** e guarda tudo **só no seu aparelho** (nada vai para servidor nenhum).

## O que faz

- **Lançar do seu jeito**: escreva (ou fale pelo microfone do teclado) “gastei 45,90 no ifood”,
  “uber 32 e mercado 187,50”, “recebi 3500 de salário”. O app entende o valor, a categoria, a data
  (“ontem”, “dia 10”, “12/10”) e a forma de pagamento. Também dá para usar o formulário (botão +).
- **Lembretes**: “me lembra amanhã às 10h de ligar pro dentista”, “todo dia 5 pagar o aluguel de R$ 1.500”,
  “toda segunda às 7h levar o lixo”. Repetem por dia, dias úteis, semana, mês ou ano.
  Lembrete de conta com valor: ao marcar “Feito”, o app oferece registrar o pagamento.
- **Orçamentos** por categoria, com aviso aos 80% e ao estourar.
- **Extrato** por mês, com gastos por categoria, busca e filtros.
- **Backup** em arquivo (Drive, e-mail, WhatsApp), cópias automáticas dos últimos 7 dias e exportação em planilha (CSV).

## Como os dados ficam salvos e atualizados

- Cada lançamento é salvo **na hora** no armazenamento do navegador do celular. Não tem botão de salvar.
- Saldo, gráficos e orçamentos são **recalculados a cada mudança**.
- O app pede ao celular para **não apagar** esses dados. No iPhone, use pelo ícone da tela inicial
  (o Safari pode limpar dados de sites que você não abre há semanas; apps na tela inicial não).
- **Versões novas** do app: quando o celular tem internet, o app baixa a versão nova em segundo plano e
  mostra “Nova versão pronta → Atualizar”. Os dados não são tocados.
- Mesmo assim, salve um **backup** de vez em quando (Mais → Backup). É o que garante os dados se você
  trocar ou perder o celular.

## Lembretes: como avisam

- Com o app aberto (ou recém-aberto), o lembrete aparece na hora, com aviso do celular se você ativar
  os avisos, e o número de pendentes aparece no ícone de Lembretes.
- **Com o app fechado**, um app web não consegue acordar o celular sozinho sem internet. Por isso cada
  lembrete tem **“📅 Pôr na agenda”**: gera um evento (com repetição e alarme) para a agenda do celular,
  que avisa na hora mesmo sem internet.

## Instalar no celular

O app precisa ser aberto **uma vez** por um link (https) para o celular guardá-lo. Depois funciona offline.

1. Hospede esta pasta em qualquer site estático gratuito (GitHub Pages, Netlify, Cloudflare Pages).
   Arquivos necessários: `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`.
2. Abra o link no celular:
   - **Android (Chrome)**: menu ⋮ → *Instalar app* (ou *Adicionar à tela inicial*).
   - **iPhone (Safari)**: Compartilhar → *Adicionar à Tela de Início*.
3. Abra pelo ícone. Pronto, já funciona sem internet.

No computador também dá para abrir o `index.html` direto (duplo clique), sem instalar.

## Para mexer no app

```bash
python3 build.py      # junta app.html + core.js em index.html
node --test           # testes do núcleo (frases, datas, repetições, agenda)
```

- `app.html`: telas e comportamento. `core.js`: leitura das frases, datas, repetição dos lembretes e
  arquivo de agenda (sem tela, testado em `test/core.test.js`).
- Ao publicar uma versão nova, aumente `APP_VERSION` no `app.html` e rode `build.py`.
- Se o formato dos dados mudar, adicione a conversão em `migrate()` no `app.html`, para os dados antigos continuarem funcionando.
