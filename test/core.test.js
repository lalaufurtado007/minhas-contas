const assert = require("node:assert/strict");
const test = require("node:test");
const C = require("../core.js");

const D = (s) => C.parseLocal(s);
const cats = {
  despesa: ["mercado", "alimentação", "transporte", "moradia", "contas", "saúde", "lazer", "educação", "compras", "assinaturas", "pets", "outros"].map((name) => ({ name })),
  receita: ["salário", "freelance", "vendas", "investimentos", "outros"].map((name) => ({ name })),
};
const NOW = D("2026-10-15T14:30"); // quinta-feira
const ctx = { cats, learned: {} };

test("dinheiro", () => {
  assert.equal(C.parseMoney("45,90"), 4590);
  assert.equal(C.parseMoney("1.234,56"), 123456);
  assert.equal(C.parseMoney("12.5"), 1250);
  assert.equal(C.parseMoney("R$ 3500"), 350000);
  assert.equal(C.parseMoney("0"), null);
  assert.equal(C.parseMoney("abc"), null);
  assert.equal(C.brl(123456), "R$ 1.234,56");
  assert.equal(C.brl(-1999), "−R$ 19,99");
  assert.equal(C.brl(500, { plus: true }), "+R$ 5,00");
});

const rec = [
  ["2026-10-10T09:00", "nenhuma", "2026-10-08T12:00", "2026-10-10T09:00"],
  ["2026-10-10T09:00", "nenhuma", "2026-10-10T09:00", null],
  ["2026-10-01T08:00", "diaria", "2026-10-08T07:59", "2026-10-08T08:00"],
  ["2026-10-01T08:00", "diaria", "2026-10-08T08:00", "2026-10-09T08:00"],
  ["2026-10-01T08:00", "semanal", "2026-10-08T08:00", "2026-10-15T08:00"],
  ["2026-10-01T08:00", "semanal", "2026-10-07T23:00", "2026-10-08T08:00"],
  ["2026-01-31T10:00", "mensal", "2026-01-31T10:00", "2026-02-28T10:00"],
  ["2026-01-31T10:00", "mensal", "2026-02-28T10:00", "2026-03-31T10:00"],
  ["2026-01-31T10:00", "mensal", "2026-04-01T00:00", "2026-04-30T10:00"],
  ["2024-02-29T09:00", "anual", "2024-02-29T09:00", "2025-02-28T09:00"],
  ["2024-02-29T09:00", "anual", "2027-06-01T00:00", "2028-02-29T09:00"],
  ["2026-10-05T07:00", "dias_uteis", "2026-10-09T07:00", "2026-10-12T07:00"],
  ["2026-10-10T07:00", "dias_uteis", "2026-10-08T00:00", "2026-10-12T07:00"],
];
for (const [start, r, after, exp] of rec) {
  test(`recorrência ${r} ${start} depois de ${after}`, () => {
    const got = C.nextOccurrence(D(start), r, D(after));
    assert.equal(got ? C.fmtLocal(got) : null, exp);
  });
}

const tx = (text, now = NOW) => C.parseQuick(text, now, ctx);
const pick = (r) => r.items.map((i) => [i.kind, i.cents, i.category, i.desc, i.date, i.pay]);

test("gastos simples", () => {
  assert.deepEqual(pick(tx("gastei 45,90 no ifood")), [["despesa", 4590, "alimentação", "ifood", "2026-10-15", ""]]);
  assert.deepEqual(pick(tx("uber 23")), [["despesa", 2300, "transporte", "uber", "2026-10-15", ""]]);
  assert.deepEqual(pick(tx("mercado 187,50 no débito")), [["despesa", 18750, "mercado", "mercado", "2026-10-15", "débito"]]);
  assert.deepEqual(pick(tx("paguei 1.500 de aluguel no pix")), [["despesa", 150000, "moradia", "aluguel", "2026-10-15", "pix"]]);
  assert.deepEqual(pick(tx("farmácia R$ 32 ontem")), [["despesa", 3200, "saúde", "farmácia", "2026-10-14", ""]]);
  assert.deepEqual(pick(tx("netflix 55,90 dia 10 no cartão")), [["despesa", 5590, "assinaturas", "netflix", "2026-10-10", "crédito"]]);
  assert.deepEqual(pick(tx("cinema 40 dia 20")), [["despesa", 4000, "lazer", "cinema", "2026-09-20", ""]]); // dia 20 ainda não chegou -> mês passado
  assert.deepEqual(pick(tx("comprei uma camiseta 79,90 em 12/10")), [["despesa", 7990, "outros", "camiseta", "2026-10-12", ""]]);
});

test("receitas", () => {
  assert.deepEqual(pick(tx("recebi 3500 de salário")), [["receita", 350000, "salário", "salário", "2026-10-15", ""]]);
  assert.deepEqual(pick(tx("caiu o salário 5.200,00 dia 5")), [["receita", 520000, "salário", "salário", "2026-10-05", ""]]);
  assert.deepEqual(pick(tx("vendi a bike por 2 mil")), [["receita", 200000, "vendas", "bike", "2026-10-15", ""]]);
});

test("vários lançamentos numa frase", () => {
  assert.deepEqual(pick(tx("gastei 32 de uber e 187,50 no mercado")), [
    ["despesa", 3200, "transporte", "uber", "2026-10-15", ""],
    ["despesa", 18750, "mercado", "mercado", "2026-10-15", ""],
  ]);
  assert.deepEqual(pick(tx("uber 32 mercado 187")), [
    ["despesa", 3200, "transporte", "uber", "2026-10-15", ""],
    ["despesa", 18700, "mercado", "mercado", "2026-10-15", ""],
  ]);
});

test("aprende categorias e usa as suas", () => {
  const c2 = { cats: { ...cats, despesa: [...cats.despesa, { name: "academia" }] }, learned: { posto: "transporte", zara: "compras" } };
  assert.equal(C.parseQuick("academia 120", NOW, c2).items[0].category, "academia");
  assert.equal(C.parseQuick("zara 300", NOW, c2).items[0].category, "compras");
});

test("frase sem valor não vira lançamento", () => {
  assert.equal(tx("gastei no posto"), null);
  assert.equal(tx(""), null);
});

const rem = (text, now = NOW) => {
  const r = C.parseQuick(text, now, ctx);
  return r && [r.type, r.text, r.when, r.rec, r.cents];
};

test("lembretes", () => {
  assert.deepEqual(rem("me lembra amanhã às 10h de ligar pro dentista"), ["rem", "Ligar pro dentista", "2026-10-16T10:00", "nenhuma", null]);
  assert.deepEqual(rem("me lembra de pagar a luz dia 20"), ["rem", "Pagar a luz", "2026-10-20T09:00", "nenhuma", null]);
  assert.deepEqual(rem("me lembra de pagar a luz dia 10"), ["rem", "Pagar a luz", "2026-11-10T09:00", "nenhuma", null]);
  assert.deepEqual(rem("lembrete: tomar remédio todo dia às 8"), ["rem", "Tomar remédio", "2026-10-16T08:00", "diaria", null]);
  assert.deepEqual(rem("me lembra todo dia 5 de pagar o aluguel de R$ 1.500"), ["rem", "Pagar o aluguel", "2026-11-05T09:00", "mensal", 150000]);
  assert.deepEqual(rem("me lembra sexta 18:30 de buscar a encomenda"), ["rem", "Buscar a encomenda", "2026-10-16T18:30", "nenhuma", null]);
  assert.deepEqual(rem("me lembra quinta às 9 da reunião"), ["rem", "Reunião", "2026-10-22T09:00", "nenhuma", null]);
  assert.deepEqual(rem("me lembra toda segunda às 7h de levar o lixo"), ["rem", "Levar o lixo", "2026-10-19T07:00", "semanal", null]);
  assert.deepEqual(rem("me lembra daqui 2 horas de tirar a roupa da máquina"), ["rem", "Tirar a roupa da máquina", "2026-10-15T16:30", "nenhuma", null]);
  assert.deepEqual(rem("me avisa às 8 da noite de ligar pra mãe"), ["rem", "Ligar pra mãe", "2026-10-15T20:00", "nenhuma", null]);
  assert.deepEqual(rem("me lembra de beber água"), ["rem", "Beber água", "2026-10-16T09:00", "nenhuma", null]);
  assert.deepEqual(rem("me lembra nos dias úteis às 7:30 de tomar o remédio"), ["rem", "Tomar o remédio", "2026-10-16T07:30", "dias_uteis", null]);
  assert.deepEqual(rem("me lembra todo ano dia 25/12 do amigo secreto"), ["rem", "Amigo secreto", "2026-12-25T09:00", "anual", null]);
});

test("agenda .ics", () => {
  const ics = C.toICS({ id: "abc", text: "Pagar luz; urgente", next: "2026-10-31T09:00", rec: "mensal", cents: 18000 }, new Date(Date.UTC(2026, 9, 15, 12)));
  assert.match(ics, /DTSTART:20261031T090000\r\n/);
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1\r\n/);
  assert.ok(ics.includes("SUMMARY:Pagar luz\\; urgente\r\n"));
  assert.ok(ics.includes("DESCRIPTION:Valor: R$ 180\\,00\r\n"));
  assert.match(ics, /TRIGGER:PT0M/);
  assert.match(C.toICS({ id: "x", text: "a", next: "2026-10-16T08:00", rec: "dias_uteis" }), /BYDAY=MO,TU,WE,TH,FR/);
  const many = C.toICS([{ id: "1", text: "a", next: "2026-10-16T08:00", rec: "nenhuma" }, { id: "2", text: "b", next: "2026-10-17T08:00", rec: "anual" }]);
  assert.equal(many.match(/BEGIN:VEVENT/g).length, 2);
  assert.equal(many.match(/BEGIN:VCALENDAR/g).length, 1);
  assert.ok(many.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n"));
});
