/* Núcleo do app (sem tela): dinheiro, datas, recorrência, leitura de frases e agenda (.ics).
   Este arquivo é copiado para dentro do index.html pelo build.py. Testes: node test/core.test.js */

const Core = (() => {
  // ---------- dinheiro ----------
  function parseMoney(str) {
    if (str == null) return null;
    let s = String(str).replace(/r\$\s*/i, "").replace(/\s/g, "");
    if (!s) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
    else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const cents = Math.round(parseFloat(s) * 100);
    return cents > 0 ? cents : null;
  }

  function brl(cents, opts = {}) {
    const neg = cents < 0;
    const abs = Math.abs(Math.round(cents));
    const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const frac = String(abs % 100).padStart(2, "0");
    const sign = neg ? "−" : opts.plus && cents > 0 ? "+" : "";
    return `${sign}R$ ${int},${frac}`;
  }

  // ---------- datas (sempre horário local do aparelho) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtLocal = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function parseDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function parseLocal(s) {
    const [d, t = "09:00"] = s.split("T");
    const [y, m, dd] = d.split("-").map(Number);
    const [hh, mi] = t.split(":").map(Number);
    return new Date(y, m - 1, dd, hh, mi, 0, 0);
  }
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  function addMonths(start, k) {
    const total = start.getMonth() + k;
    const y = start.getFullYear() + Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    const day = Math.min(start.getDate(), lastDayOfMonth(y, m));
    return new Date(y, m, day, start.getHours(), start.getMinutes());
  }

  const RECURRENCES = {
    nenhuma: "Não repete",
    diaria: "Todo dia",
    dias_uteis: "Dias úteis",
    semanal: "Toda semana",
    mensal: "Todo mês",
    anual: "Todo ano",
  };

  /** Primeira ocorrência estritamente depois de `after`. Sempre calculada a partir do início,
      então um lembrete mensal no dia 31 cai em 30/04, 28/02... e volta ao 31 quando dá. */
  function nextOccurrence(start, rec, after) {
    if (start > after) {
      if (rec === "dias_uteis" && isWeekend(start)) return nextOccurrence(start, rec, start);
      return start;
    }
    if (rec === "nenhuma") return null;
    if (rec === "diaria" || rec === "dias_uteis") {
      let c = new Date(after.getFullYear(), after.getMonth(), after.getDate(), start.getHours(), start.getMinutes());
      while (c <= after || (rec === "dias_uteis" && isWeekend(c))) c = addDays(c, 1);
      return c;
    }
    if (rec === "semanal") {
      let c = addDays(start, Math.floor((dayNumber(after) - dayNumber(start)) / 7) * 7);
      while (c <= after) c = addDays(c, 7);
      return c;
    }
    if (rec === "mensal" || rec === "anual") {
      const step = rec === "mensal" ? 1 : 12;
      const months = (after.getFullYear() - start.getFullYear()) * 12 + after.getMonth() - start.getMonth();
      let k = Math.max(Math.floor(months / step) * step - step, 0);
      for (;;) {
        const c = addMonths(start, k);
        if (c > after) return c;
        k += step;
      }
    }
    throw new Error("Recorrência inválida: " + rec);
  }

  // ---------- leitura de frases ----------
  // "dobra" acentos sem mudar o tamanho do texto, para apagar trechos no original
  const fold = (s) => s.split("").map((c) => c.normalize("NFD")[0]).join("").toLowerCase();

  const WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const WEEKDAY_RE = "(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?";

  const KEYWORDS = {
    mercado: ["mercado", "supermercado", "feira", "atacadao", "atacado", "hortifruti", "sacolao", "assai", "carrefour"],
    "alimentação": ["ifood", "restaurante", "lanche", "almoco", "almocei", "jantar", "jantei", "pizza", "padaria", "cafe", "hamburguer", "acai", "marmita", "delivery", "sorvete", "comida"],
    transporte: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "combustivel", "posto", "estacionamento", "pedagio", "passagem", "etanol", "alcool", "oficina", "mecanico"],
    moradia: ["aluguel", "condominio", "iptu", "reforma", "diarista"],
    contas: ["luz", "energia", "agua", "internet", "telefone", "celular", "gas", "conta", "fatura", "boleto"],
    "saúde": ["farmacia", "remedio", "medico", "dentista", "consulta", "exame", "plano de saude", "academia", "terapia"],
    lazer: ["cinema", "show", "bar", "viagem", "passeio", "ingresso", "jogo", "festa", "cerveja"],
    assinaturas: ["netflix", "spotify", "assinatura", "streaming", "prime", "disney", "hbo", "youtube", "icloud", "globoplay"],
    compras: ["roupa", "loja", "shopee", "amazon", "mercado livre", "shein", "sapato", "presente", "magalu"],
    "educação": ["curso", "escola", "faculdade", "livro", "material", "mensalidade"],
    pets: ["pet", "racao", "veterinario", "petshop", "banho e tosa"],
    "salário": ["salario", "pagamento da empresa", "holerite"],
    freelance: ["freela", "freelance", "servico", "projeto", "bico"],
    vendas: ["vendi", "venda"],
    investimentos: ["rendimento", "dividendo", "investimento", "juros", "cdb", "tesouro"],
  };
  const INCOME_RE = /\b(recebi|ganhei|caiu|entrou|vendi|recebido|recebimento|reembolso|salario|rendimento|dividendo|renda|freela)\b/;
  const FILLER = new Set(
    "gastei paguei comprei recebi ganhei vendi caiu entrou por pelo pela via foi deu de do da dos das no na nos nas em com pro pra para o a os as um uma uns umas r$ reais real conto contos pila mais e que hoje ontem anteontem".split(" ")
  );
  const PAYMENTS = [
    ["pix", /\b(no |via |pelo |por )?pix\b/],
    ["crédito", /\b(no |via |pelo |por )?(cartao de credito|credito|cartao)\b/],
    ["débito", /\b(no |via |pelo |por )?(cartao de debito|debito)\b/],
    ["dinheiro", /\b(em |no )?(dinheiro|especie)\b/],
    ["boleto", /\b(no |via |pelo |por )?boleto\b/],
  ];
  const AMOUNT_RE =
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*mil\b)?(?:\s*(?:reais|real|conto|contos|pila|r\$))?/g;

  function blank(orig, folded, re) {
    // apaga (com espaços) todos os trechos de `re` em orig/folded; retorna os matches
    const found = [];
    let o = orig, f = folded;
    f.replace(re, (...args) => {
      const m = args[0], idx = args[args.length - 2];
      found.push({ m, idx, groups: args.slice(1, -2) });
      return m;
    });
    for (const { m, idx } of found) {
      o = o.slice(0, idx) + " ".repeat(m.length) + o.slice(idx + m.length);
      f = f.slice(0, idx) + " ".repeat(m.length) + f.slice(idx + m.length);
    }
    return { orig: o, folded: f, found };
  }

  function cleanText(s) {
    return s.replace(/[,;:.!?]+(\s|$)/g, " ").replace(/\s+/g, " ").trim();
  }

  function parseWhenDay(folded, now) {
    // retorna {date, re} da primeira data encontrada (sem hora)
    const rules = [
      [/\bdepois de amanha\b/, () => addDays(now, 2)],
      [/\bamanha\b/, () => addDays(now, 1)],
      [/\banteontem\b/, () => addDays(now, -2)],
      [/\bontem\b/, () => addDays(now, -1)],
      [/\bhoje\b/, () => now],
    ];
    for (const [re, fn] of rules) if (re.test(folded)) return { date: fn(), re };
    let m = folded.match(/\b(?:dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      let y = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : now.getFullYear();
      return { date: new Date(y, Number(m[2]) - 1, Number(m[1])), re: new RegExp(m[0].replace(/\//g, "\\/")), explicitYear: !!m[3], dm: true };
    }
    m = folded.match(/\bdia (\d{1,2})\b/);
    if (m) return { dayOfMonth: Number(m[1]), re: /\bdia \d{1,2}\b/ };
    m = folded.match(new RegExp("\\b(?:na |no |nesta |nessa |proxima |proximo )?" + WEEKDAY_RE + "\\b"));
    if (m) return { weekday: WEEKDAYS.indexOf(m[1]), re: new RegExp(m[0]) };
    return null;
  }

  function guessCategory(folded, kind, cats, learned) {
    const names = (cats[kind] || []).map((c) => c.name);
    for (const n of names) if (n !== "outros" && new RegExp("\\b" + fold(n) + "\\b").test(folded)) return n;
    for (const w of folded.split(/\s+/)) if (learned[w] && names.includes(learned[w])) return learned[w];
    for (const [cat, words] of Object.entries(KEYWORDS)) {
      if (!names.includes(cat)) continue;
      if (words.some((w) => new RegExp("\\b" + w + "\\b").test(folded))) return cat;
    }
    return "outros";
  }

  function describe(orig) {
    const words = cleanText(orig).split(" ").filter((w) => w && !FILLER.has(fold(w)));
    return words.join(" ");
  }

  function parseTransactions(text, now, ctx) {
    const orig0 = text, folded0 = fold(text);
    const kind = INCOME_RE.test(folded0) ? "receita" : "despesa";

    // data
    let date = now, o = orig0, f = folded0;
    const when = parseWhenDay(f, now);
    if (when) {
      if (when.date) date = when.date;
      else if (when.dayOfMonth) {
        date = new Date(now.getFullYear(), now.getMonth(), when.dayOfMonth);
        if (date > now) date = new Date(now.getFullYear(), now.getMonth() - 1, when.dayOfMonth);
      } else if (when.weekday != null) {
        const back = (now.getDay() - when.weekday + 7) % 7 || 7;
        date = addDays(now, -back);
      }
      if (when.dm && !when.explicitYear && date > now) date = new Date(date.getFullYear() - 1, date.getMonth(), date.getDate());
      ({ orig: o, folded: f } = blank(o, f, new RegExp(when.re.source, "g")));
    }

    // forma de pagamento
    let pay = "";
    for (const [name, re] of PAYMENTS) {
      if (re.test(f)) {
        pay = name;
        ({ orig: o, folded: f } = blank(o, f, new RegExp(re.source, "g")));
        break;
      }
    }

    // valores
    const amounts = [];
    f.replace(AMOUNT_RE, (m, num, mil, idx) => {
      let cents = parseMoney(num);
      if (cents && mil) cents *= 1000;
      if (cents) amounts.push({ cents, idx, len: m.length });
      return m;
    });
    if (!amounts.length) return null;

    // vários valores -> quebra em pedaços ("32 de uber e 187,50 no mercado")
    const pieces = [];
    for (let i = 0; i < amounts.length; i++) {
      const a = amounts[i];
      const to = i + 1 < amounts.length ? amounts[i + 1].idx : f.length;
      // texto antes do 1º valor e depois do último pertence ao pedaço
      // o texto entre dois valores vai até o " e " / "," / ";" (ou, sem separador, para o próximo)
      let segEnd = to;
      if (i + 1 < amounts.length) {
        const between = f.slice(a.idx + a.len, to);
        const sep = Math.max(between.lastIndexOf(" e "), between.lastIndexOf(", "), between.lastIndexOf(";"));
        segEnd = a.idx + a.len + Math.max(sep, 0);
      }
      const segStart = i === 0 ? 0 : pieces[i - 1].end;
      pieces.push({ cents: a.cents, start: segStart, end: segEnd, amtIdx: a.idx, amtLen: a.len });
    }

    return pieces.map((p) => {
      let po = o.slice(p.start, p.end), pf = f.slice(p.start, p.end);
      const rel = p.amtIdx - p.start;
      po = po.slice(0, rel) + " ".repeat(p.amtLen) + po.slice(rel + p.amtLen);
      pf = pf.slice(0, rel) + " ".repeat(p.amtLen) + pf.slice(rel + p.amtLen);
      const category = guessCategory(pf, kind, ctx.cats, ctx.learned || {});
      const desc = describe(po);
      return { kind, cents: p.cents, category, desc, date: ymd(date), pay };
    });
  }

  function parseTime(folded) {
    let m = folded.match(/\b(?:as |a )?(\d{1,2})(?::|h)(\d{2})\b/);
    let h, mi = 0, re;
    if (m) { h = +m[1]; mi = +m[2]; re = m[0]; }
    else if ((m = folded.match(/\b(?:as |a )?(\d{1,2}) ?h(?:oras?|rs?)?\b/))) { h = +m[1]; re = m[0]; }
    else if ((m = folded.match(/\b(?:as|a) (\d{1,2})(?! ?\/)\b(?: horas?)?/))) { h = +m[1]; re = m[0]; }
    else if ((m = folded.match(/\b(?:ao |as |a )?meio[- ]dia\b/))) { h = 12; re = m[0]; }
    else if ((m = folded.match(/\b(?:a )?meia[- ]noite\b/))) { h = 0; re = m[0]; }
    if (h == null || h > 23 || mi > 59) return null;
    let extra = "";
    const pm = folded.match(/\bda (tarde|noite)\b/);
    if (pm && h < 12) { h += 12; extra = pm[0]; }
    const am = folded.match(/\bda manha\b/);
    if (am) extra = am[0];
    return { h, mi, re, extra };
  }

  function parseReminder(text, now) {
    let o = text, f = fold(text);
    const strip = (re) => ({ orig: o, folded: f } = blank(o, f, re));

    // recorrência
    let rec = "nenhuma", recDay = null, recWeekday = null;
    let m;
    if ((m = f.match(/\b(?:todo |nos |em )?dias? ute(?:is|l)\b|\btodo dia util\b|\bde segunda a sexta\b/))) {
      rec = "dias_uteis"; strip(new RegExp(m[0], "g"));
    } else if ((m = f.match(/\btodo (?:santo )?dia (\d{1,2})\b|\btodo mes(?: no)? dia (\d{1,2})\b|\btodo dia (\d{1,2}) de cada mes\b/))) {
      rec = "mensal"; recDay = +(m[1] || m[2] || m[3]); strip(new RegExp(m[0], "g"));
    } else if ((m = f.match(/\btodos? (?:os )?dias?\b|\bdiariamente\b|\btoda noite\b|\btoda manha\b/))) {
      rec = "diaria"; strip(new RegExp(m[0], "g"));
    } else if ((m = f.match(new RegExp("\\btodas? (?:as |os )?" + WEEKDAY_RE + "s?\\b")))) {
      rec = "semanal"; recWeekday = WEEKDAYS.indexOf(m[1]); strip(new RegExp(m[0], "g"));
    } else if ((m = f.match(/\btoda semana\b|\bsemanalmente\b/))) {
      rec = "semanal"; strip(new RegExp(m[0], "g"));
    } else if ((m = f.match(/\btodo mes\b|\bmensalmente\b/))) {
      rec = "mensal"; strip(new RegExp(m[0], "g"));
    } else if ((m = f.match(/\btodo ano\b|\banualmente\b/))) {
      rec = "anual"; strip(new RegExp(m[0], "g"));
    }

    // "daqui 2 horas", "em 30 minutos"
    let when = null, explicitDay = false;
    if ((m = f.match(/\b(?:daqui(?: a)?|em|dentro de) (\d{1,3}) ?(minutos?|min|horas?|h|dias?)\b/))) {
      const n = +m[1], u = m[2];
      when = u.startsWith("d") ? addDays(now, n) : new Date(now.getTime() + n * (u.startsWith("h") ? 3600e3 : 60e3));
      when.setSeconds(0, 0);
      strip(new RegExp(m[0], "g"));
      explicitDay = true;
    }

    const time = when ? null : parseTime(f);
    if (time) { strip(new RegExp(time.re.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")); if (time.extra) strip(new RegExp(time.extra, "g")); }

    if (!when) {
      const h = time ? time.h : 9, mi = time ? time.mi : 0;
      let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const wd = recWeekday != null ? { weekday: recWeekday } : parseWhenDay(f, now);
      if (wd && recWeekday == null) strip(new RegExp(wd.re.source, "g"));
      if (recDay != null) {
        day = new Date(now.getFullYear(), now.getMonth(), recDay);
        explicitDay = true;
      } else if (wd) {
        explicitDay = true;
        if (wd.date) day = new Date(wd.date.getFullYear(), wd.date.getMonth(), wd.date.getDate());
        else if (wd.dayOfMonth) {
          day = new Date(now.getFullYear(), now.getMonth(), wd.dayOfMonth);
          if (new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi) <= now) day = new Date(now.getFullYear(), now.getMonth() + 1, wd.dayOfMonth);
        } else if (wd.weekday != null) {
          let ahead = (wd.weekday - now.getDay() + 7) % 7;
          const cand = addDays(day, ahead);
          if (ahead === 0 && new Date(cand.getFullYear(), cand.getMonth(), cand.getDate(), h, mi) <= now) ahead = 7;
          day = addDays(day, ahead);
        }
      }
      when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi);
      // sem dia dito e o horário de hoje já passou -> amanhã (para lembretes únicos)
      if (!explicitDay && rec === "nenhuma" && when <= now) when = addDays(when, 1);
      if (rec !== "nenhuma") when = nextOccurrence(when, rec, now) || when;
    }

    // valor opcional ("pagar a luz de 180")
    let cents = null;
    const am = f.match(/(?:r\$\s*)?\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\b(?:\s*(?:reais|real))?/);
    if (am && /r\$|reais|real|,\d{2}\b/.test(am[0]) ) {
      cents = parseMoney(am[1]);
      if (cents) strip(new RegExp(am[0].replace(/[.*+?^${}()|[\]\\$]/g, "\\$&"), "g"));
    }

    // texto do lembrete: tira "me lembra de", "lembrete:", etc.
    strip(/\b(?:me |nos )?(?:lembr(?:a|e|ar|ete)s?|avis(?:a|e|ar)(?: me)?)(?: me)?\b:?/g);
    let t = cleanText(o).replace(/^(?:(?:de|que|para|pra|pro|do|da|a|o|eu|tenho que|preciso)\s+)+/i, "").replace(/\s+(?:de|para|pra|as|a|no|na|e)$/i, "").trim();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return { text: t, when: fmtLocal(when), rec, cents };
  }

  const REMINDER_RE = /\b(me lembr|lembr(a|e|ar|ete)\b|avis(a|e|ar) me|me avis)/;

  /** Entende uma frase livre. Retorna {type:"tx", items:[...]} | {type:"rem", ...} | null */
  function parseQuick(text, now, ctx) {
    const t = (text || "").trim();
    if (!t) return null;
    if (REMINDER_RE.test(fold(t))) {
      const r = parseReminder(t, now);
      return r.text ? { type: "rem", ...r } : null;
    }
    const items = parseTransactions(t, now, ctx);
    return items ? { type: "tx", items } : null;
  }

  // ---------- agenda (.ics) ----------
  function icsEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  }
  function icsDate(d) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  }
  function rrule(rec, start) {
    switch (rec) {
      case "diaria": return "FREQ=DAILY";
      case "dias_uteis": return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
      case "semanal": return "FREQ=WEEKLY";
      case "mensal": {
        const d = start.getDate();
        if (d <= 28) return `FREQ=MONTHLY;BYMONTHDAY=${d}`;
        const days = []; for (let i = 28; i <= d; i++) days.push(i);
        return `FREQ=MONTHLY;BYMONTHDAY=${days.join(",")};BYSETPOS=-1`;
      }
      case "anual": return "FREQ=YEARLY";
      default: return null;
    }
  }
  function vevent(rem, stamp) {
    const start = parseLocal(rem.next || rem.start);
    const end = new Date(start.getTime() + 15 * 60e3);
    const lines = [
      "BEGIN:VEVENT",
      `UID:${rem.id}@minhas-contas`,
      `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(rem.text)}`,
    ];
    if (rem.cents) lines.push(`DESCRIPTION:${icsEscape("Valor: " + brl(rem.cents))}`);
    const rr = rrule(rem.rec, start);
    if (rr) lines.push(`RRULE:${rr}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(rem.text)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
    return lines;
  }
  /** Arquivo de agenda (.ics) com um ou vários lembretes; a agenda do celular avisa na hora. */
  function toICS(rems, stamp = new Date()) {
    const list = Array.isArray(rems) ? rems : [rems];
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Minhas Contas//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    for (const r of list) lines.push(...vevent(r, stamp));
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  return {
    parseMoney, brl, ymd, fmtLocal, parseDate, parseLocal, addDays, addMonths, nextOccurrence, RECURRENCES,
    fold, parseQuick, parseTransactions, parseReminder, toICS, lastDayOfMonth, KEYWORDS,
  };
})();

if (typeof module !== "undefined") module.exports = Core;
