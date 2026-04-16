const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'data', 'db.json');
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'igreja-financas-v3-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

function monthNameFromDate(value) {
  if (!value) return MONTHS[new Date().getMonth()];
  const d = new Date(value);
  return MONTHS[d.getMonth()] || MONTHS[new Date().getMonth()];
}

function readDb() {
  if (!fs.existsSync(dbPath)) return null;
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function nextId(list) {
  return list.length ? Math.max(...list.map(i => i.id)) + 1 : 1;
}

async function seed() {
  if (fs.existsSync(dbPath)) return;

  const hash = await bcrypt.hash('123456', 10);

  const db = {
    users: [
      { id: 1, nome: 'Administrador', username: 'admin', senha_hash: hash, perfil: 'admin', ativo: true },
      { id: 2, nome: 'Tesoureiro', username: 'tesoureiro', senha_hash: hash, perfil: 'tesoureiro', ativo: true },
      { id: 3, nome: 'Consulta', username: 'visualizador', senha_hash: hash, perfil: 'visualizador', ativo: true }
    ],
    departamentos: [
      'Juventude', 'Activista', 'Boa Esperança', 'Mulheres', 'Igreja Mãe', 'Igreja em Geral', 'Homem', 'Missões', 'Construção'
    ].map((nome, i) => ({ id: i + 1, nome, ativo: true })),
    zonas: ['Chicuque', 'Gunja', 'Livenga', 'Nhabanda', 'Nhambiho 3', 'Pale'].map((nome, i) => ({ id: i + 1, nome, ativo: true })),
    propositos_entrada: ['Agradecimento', 'Coleta', 'Construção', 'Dízimo', 'Mão de Sentimento', 'Outros'].map((nome, i) => ({ id: i + 1, nome, ativo: true })),
    propositos_saida: ['Água', 'Alimentação', 'Comunicação', 'Construção', 'Iluminação', 'Internet', 'Material', 'Mobília', 'Santa Ceia', 'Serviços', 'Viagem', 'Vogal', 'Utensílios', 'Higiene', 'Equipamento', 'Manutenção'].map((nome, i) => ({ id: i + 1, nome, ativo: true })),
    linhas_pagamento: ['Coleta', 'Dízimo', 'Agradecimento', 'Construção', 'Outros'].map((nome, i) => ({ id: i + 1, nome, ativo: true })),
    configuracoes_financeiras: [
      { id: 1, ano: 2026, transporte_banco: 9500, transporte_caixa: 300 }
    ],
    lancamentos: []
  };

  writeDb(db);
}

function setFlash(req, tipo, texto) {
  req.session.flash = { tipo, texto };
}

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRoles(...perfis) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!perfis.includes(req.session.user.perfil)) {
      setFlash(req, 'erro', 'Você não tem permissão para esta ação.');
      return res.redirect('/dashboard');
    }
    next();
  };
}

function attachNames(db, l) {
  const propositoEntrada = db.propositos_entrada.find(i => i.id === Number(l.proposito_entrada_id))?.nome || '-';
  const propositoSaida = db.propositos_saida.find(i => i.id === Number(l.proposito_saida_id))?.nome || '-';

  return {
    ...l,
    departamento: db.departamentos.find(i => i.id === Number(l.departamento_id))?.nome || '-',
    zona: db.zonas.find(i => i.id === Number(l.zona_id))?.nome || '-',
    proposito_entrada: propositoEntrada,
    proposito_saida: propositoSaida,
    proposito: propositoEntrada !== '-' ? propositoEntrada : (propositoSaida !== '-' ? propositoSaida : '-'),
    linha_pagamento: db.linhas_pagamento.find(i => i.id === Number(l.linha_pagamento_id))?.nome || '-',
    usuario: db.users.find(i => i.id === Number(l.usuario_id))?.nome || '-'
  };
}

function yearOf(item) {
  return String(item.data || '').slice(0, 4);
}

function sum(list, predicate) {
  return list.filter(predicate).reduce((a, b) => a + Number(b.valor_total || 0), 0);
}

function currency(n) {
  return Number(n || 0).toLocaleString('pt-MZ');
}

function buildReport(db, ano, mes = '') {
  const anoStr = String(ano);
  const mesStr = String(mes || '');

  let lancs = db.lancamentos.filter(l => yearOf(l) === anoStr);
  if (mesStr) lancs = lancs.filter(l => String(l.mes) === mesStr);

  const cfg = db.configuracoes_financeiras.find(c => String(c.ano) === anoStr) || {
    transporte_banco: 0,
    transporte_caixa: 0
  };

  const resumo = {
    transporte_banco: Number(cfg.transporte_banco) + sum(lancs, l => l.tipo_movimento === 'Transporte' && l.local_movimento === 'Banco'),
    transporte_caixa: Number(cfg.transporte_caixa) + sum(lancs, l => l.tipo_movimento === 'Transporte' && l.local_movimento === 'Caixa'),
    entrada_banco: sum(lancs, l => l.tipo_movimento === 'Entrada' && l.local_movimento === 'Banco'),
    saida_banco: sum(lancs, l => l.tipo_movimento === 'Saida' && l.local_movimento === 'Banco'),
    entrada_caixa: sum(lancs, l => l.tipo_movimento === 'Entrada' && l.local_movimento === 'Caixa'),
    saida_caixa: sum(lancs, l => l.tipo_movimento === 'Saida' && l.local_movimento === 'Caixa')
  };

  resumo.saldo_banco = resumo.transporte_banco + resumo.entrada_banco - resumo.saida_banco;
  resumo.saldo_caixa = resumo.transporte_caixa + resumo.entrada_caixa - resumo.saida_caixa;
  resumo.saldo_total = resumo.saldo_banco + resumo.saldo_caixa;
  resumo.saidas_totais = resumo.saida_banco + resumo.saida_caixa;
  resumo.entradas_totais = resumo.entrada_banco + resumo.entrada_caixa;

  const porDepartamento = db.departamentos.map(dep => {
    const dl = lancs.filter(l => Number(l.departamento_id) === dep.id);

    const item = {
      nome: dep.nome,
      transporte_banco: sum(dl, l => l.tipo_movimento === 'Transporte' && l.local_movimento === 'Banco'),
      entrada_banco: sum(dl, l => l.tipo_movimento === 'Entrada' && l.local_movimento === 'Banco'),
      saida_banco: sum(dl, l => l.tipo_movimento === 'Saida' && l.local_movimento === 'Banco'),
      transporte_caixa: sum(dl, l => l.tipo_movimento === 'Transporte' && l.local_movimento === 'Caixa'),
      entrada_caixa: sum(dl, l => l.tipo_movimento === 'Entrada' && l.local_movimento === 'Caixa'),
      saida_caixa: sum(dl, l => l.tipo_movimento === 'Saida' && l.local_movimento === 'Caixa')
    };

    item.total = item.transporte_banco + item.entrada_banco + item.saida_banco + item.transporte_caixa + item.entrada_caixa + item.saida_caixa;
    return item;
  }).filter(item => item.total > 0 || !mesStr);

  const despesas = db.propositos_saida.map(ps => ({
    nome: ps.nome,
    total: sum(lancs, l => l.tipo_movimento === 'Saida' && Number(l.proposito_saida_id) === ps.id)
  })).filter(item => item.total > 0).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

  const rows = [...lancs]
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id))
    .map(l => attachNames(db, l));

  const maxDep = Math.max(1, ...porDepartamento.map(i => i.total || 0));
  const chartDepartamento = porDepartamento
    .map(item => ({
      nome: item.nome,
      total: item.total,
      largura: Math.round((item.total / maxDep) * 100)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const movimentosResumo = [
    { nome: 'Entradas Banco', total: resumo.entrada_banco },
    { nome: 'Saídas Banco', total: resumo.saida_banco },
    { nome: 'Entradas Caixa', total: resumo.entrada_caixa },
    { nome: 'Saídas Caixa', total: resumo.saida_caixa }
  ];

  const maxMov = Math.max(1, ...movimentosResumo.map(i => i.total || 0));
  const chartMovimento = movimentosResumo.map(item => ({
    ...item,
    largura: Math.round((item.total / maxMov) * 100)
  }));

  const mensal = MONTHS.map(m => {
    const ml = db.lancamentos.filter(l => yearOf(l) === anoStr && l.mes === m);
    const entradas = sum(ml, l => l.tipo_movimento === 'Entrada');
    const saidas = sum(ml, l => l.tipo_movimento === 'Saida');

    return { nome: m, entradas, saidas };
  });

  const maxMensal = Math.max(1, ...mensal.flatMap(i => [i.entradas, i.saidas]));
  const chartMensal = mensal.map(item => ({
    ...item,
    larguraEntradas: Math.round((item.entradas / maxMensal) * 100),
    larguraSaidas: Math.round((item.saidas / maxMensal) * 100)
  }));

  return {
    ano: anoStr,
    mes: mesStr,
    resumo,
    porDepartamento,
    despesas,
    rows,
    chartDepartamento,
    chartMovimento,
    chartMensal
  };
}

function reportRowsToCsv(rows) {
  const header = ['Data','Mês','Tipo','Local','Departamento','Zona','Propósito','Valor Total'];
  const escape = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

  return [header.join(';')]
    .concat(rows.map(r => [
      r.data,
      r.mes,
      r.tipo_movimento,
      r.local_movimento,
      r.departamento,
      r.zona || '',
      r.proposito || '',
      r.valor_total
    ].map(escape).join(';')))
    .join('\n');
}

function reportRowsToExcelHtml(report) {
  const rowsHtml = report.rows.map(r =>
    `<tr><td>${r.data}</td><td>${r.mes}</td><td>${r.tipo_movimento}</td><td>${r.local_movimento}</td><td>${r.departamento}</td><td>${r.zona || '-'}</td><td>${r.proposito || '-'}</td><td>${Number(r.valor_total || 0)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:8px}th{background:#ddeeff}</style></head><body><h2>Relatório Financeiro ${report.ano}${report.mes ? ' - ' + report.mes : ''}</h2><table><thead><tr><th>Data</th><th>Mês</th><th>Tipo</th><th>Local</th><th>Departamento</th><th>Zona</th><th>Propósito</th><th>Valor</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="8">Sem dados</td></tr>'}</tbody></table></body></html>`;
}

function reportHtml(report) {
  const depRows = report.porDepartamento.map(item =>
    `<tr><td>${item.nome}</td><td>${currency(item.transporte_banco)}</td><td>${currency(item.entrada_banco)}</td><td>${currency(item.saida_banco)}</td><td>${currency(item.transporte_caixa)}</td><td>${currency(item.entrada_caixa)}</td><td>${currency(item.saida_caixa)}</td></tr>`
  ).join('');

  const despRows = report.despesas.map(item =>
    `<tr><td>${item.nome}</td><td>${currency(item.total)}</td></tr>`
  ).join('');

  const movRows = report.rows.map(item =>
    `<tr><td>${item.data}</td><td>${item.mes}</td><td>${item.tipo_movimento}</td><td>${item.local_movimento}</td><td>${item.departamento}</td><td>${item.zona || '-'}</td><td>${item.proposito || '-'}</td><td>${currency(item.valor_total)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>Relatório ${report.ano}</title><style>body{font-family:Arial;margin:24px;color:#1f2937}h1,h2{color:#1e3a8a}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left}th{background:#eff6ff}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:20px}.box{border:1px solid #d1d5db;border-top:4px solid #f97316;border-radius:10px;padding:12px}.small{color:#6b7280} @media print {.no-print{display:none}}</style></head><body><div class="no-print" style="margin-bottom:16px"><button onclick="window.print()">Guardar como PDF / Imprimir</button></div><h1>Relatório Financeiro</h1><p class="small">Ano ${report.ano}${report.mes ? ' | Mês ' + report.mes : ''}</p><div class="grid"><div class="box"><strong>Saldo Banco</strong><div>${currency(report.resumo.saldo_banco)}</div></div><div class="box"><strong>Saldo Caixa</strong><div>${currency(report.resumo.saldo_caixa)}</div></div><div class="box"><strong>Saldo Total</strong><div>${currency(report.resumo.saldo_total)}</div></div><div class="box"><strong>Saídas Totais</strong><div>${currency(report.resumo.saidas_totais)}</div></div></div><h2>Movimento por Departamento</h2><table><thead><tr><th>Departamento</th><th>Transp. Banco</th><th>Entrada Banco</th><th>Saída Banco</th><th>Transp. Caixa</th><th>Entrada Caixa</th><th>Saída Caixa</th></tr></thead><tbody>${depRows || '<tr><td colspan="7">Sem dados</td></tr>'}</tbody></table><h2>Despesas por Tipo</h2><table><thead><tr><th>Propósito de Saída</th><th>Valor Total</th></tr></thead><tbody>${despRows || '<tr><td colspan="2">Sem dados</td></tr>'}</tbody></table><h2>Movimentos</h2><table><thead><tr><th>Data</th><th>Mês</th><th>Tipo</th><th>Local</th><th>Departamento</th><th>Zona</th><th>Propósito</th><th>Valor</th></tr></thead><tbody>${movRows || '<tr><td colspan="8">Sem dados</td></tr>'}</tbody></table></body></html>`;
}

app.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));

app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

app.post('/login', async (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.username === req.body.username && u.ativo);

  if (!user) {
    setFlash(req, 'erro', 'Usuário não encontrado.');
    return res.redirect('/login');
  }

  const ok = await bcrypt.compare(req.body.senha, user.senha_hash);
  if (!ok) {
    setFlash(req, 'erro', 'Senha incorreta.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: user.id,
    nome: user.nome,
    username: user.username,
    perfil: user.perfil
  };

  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/dashboard', requireAuth, (req, res) => {
  const db = readDb();
  const ano = Number(req.query.ano || new Date().getFullYear());
  const report = buildReport(db, ano, '');
  const ultimos = [...db.lancamentos]
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id))
    .slice(0, 10)
    .map(l => attachNames(db, l));

  res.render('dashboard', {
    title: 'Dashboard',
    resumo: report.resumo,
    chartMovimento: report.chartMovimento,
    chartMensal: report.chartMensal,
    ano,
    ultimos
  });
});

function loadFormData(db) {
  return {
    departamentos: db.departamentos.filter(i => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    zonas: db.zonas.filter(i => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    entradas: db.propositos_entrada.filter(i => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    saidas: db.propositos_saida.filter(i => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome)),
    linhas: db.linhas_pagamento.filter(i => i.ativo).sort((a, b) => a.nome.localeCompare(b.nome))
  };
}

app.get('/lancamentos', requireAuth, (req, res) => {
  const db = readDb();
  const filtros = {
    mes: req.query.mes || '',
    tipo: req.query.tipo || '',
    local: req.query.local || ''
  };

  let rows = [...db.lancamentos];
  if (filtros.mes) rows = rows.filter(i => i.mes === filtros.mes);
  if (filtros.tipo) rows = rows.filter(i => i.tipo_movimento === filtros.tipo);
  if (filtros.local) rows = rows.filter(i => i.local_movimento === filtros.local);

  rows = rows
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id))
    .map(l => attachNames(db, l));

  res.render('lancamentos', {
    title: 'Lançamentos',
    rows,
    filtros,
    formData: loadFormData(db),
    editing: null
  });
});

app.post('/lancamentos', requireRoles('admin', 'tesoureiro'), (req, res) => {
  const db = readDb();
  const body = req.body;
  const quantidade = Number(body.quantidade || 1);
  const valorUnitario = Number(body.valor_unitario || 0);
  const valorTotal = Number(body.valor_total || (quantidade * valorUnitario));

  if (!body.data || !body.tipo_movimento || !body.local_movimento || !body.departamento_id || !valorTotal) {
    setFlash(req, 'erro', 'Preencha os campos obrigatórios do lançamento.');
    return res.redirect('/lancamentos');
  }

  if (body.tipo_movimento === 'Entrada' && !body.proposito_entrada_id) {
    setFlash(req, 'erro', 'Selecione o propósito de entrada.');
    return res.redirect('/lancamentos');
  }

  if (body.tipo_movimento === 'Saida' && !body.proposito_saida_id) {
    setFlash(req, 'erro', 'Selecione o propósito de saída.');
    return res.redirect('/lancamentos');
  }

  db.lancamentos.push({
    id: nextId(db.lancamentos),
    data: body.data,
    mes: body.mes || monthNameFromDate(body.data),
    tipo_movimento: body.tipo_movimento,
    local_movimento: body.local_movimento,
    departamento_id: Number(body.departamento_id),
    zona_id: body.zona_id ? Number(body.zona_id) : null,
    proposito_entrada_id: body.proposito_entrada_id ? Number(body.proposito_entrada_id) : null,
    proposito_saida_id: body.proposito_saida_id ? Number(body.proposito_saida_id) : null,
    linha_pagamento_id: body.linha_pagamento_id ? Number(body.linha_pagamento_id) : null,
    especificacao: body.especificacao || '',
    numero_requisicao: body.numero_requisicao || '',
    numero_cheque: body.numero_cheque || '',
    numero_talao: body.numero_talao || '',
    quantidade,
    valor_unitario: valorUnitario,
    valor_total: valorTotal,
    usuario_id: req.session.user.id,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  });

  writeDb(db);
  setFlash(req, 'sucesso', 'Lançamento guardado com sucesso.');
  res.redirect('/lancamentos');
});

app.get('/lancamentos/:id/editar', requireRoles('admin', 'tesoureiro'), (req, res) => {
  const db = readDb();
  const editing = db.lancamentos.find(i => i.id === Number(req.params.id));

  if (!editing) {
    setFlash(req, 'erro', 'Lançamento não encontrado.');
    return res.redirect('/lancamentos');
  }

  const rows = [...db.lancamentos]
    .sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id))
    .map(l => attachNames(db, l));

  res.render('lancamentos', {
    title: 'Lançamentos',
    rows,
    filtros: { mes: '', tipo: '', local: '' },
    formData: loadFormData(db),
    editing
  });
});

app.post('/lancamentos/:id/editar', requireRoles('admin', 'tesoureiro'), (req, res) => {
  const db = readDb();
  const item = db.lancamentos.find(i => i.id === Number(req.params.id));

  if (!item) {
    setFlash(req, 'erro', 'Lançamento não encontrado.');
    return res.redirect('/lancamentos');
  }

  const body = req.body;
  const quantidade = Number(body.quantidade || 1);
  const valorUnitario = Number(body.valor_unitario || 0);
  const valorTotal = Number(body.valor_total || (quantidade * valorUnitario));

  Object.assign(item, {
    data: body.data,
    mes: body.mes || monthNameFromDate(body.data),
    tipo_movimento: body.tipo_movimento,
    local_movimento: body.local_movimento,
    departamento_id: Number(body.departamento_id),
    zona_id: body.zona_id ? Number(body.zona_id) : null,
    proposito_entrada_id: body.proposito_entrada_id ? Number(body.proposito_entrada_id) : null,
    proposito_saida_id: body.proposito_saida_id ? Number(body.proposito_saida_id) : null,
    linha_pagamento_id: body.linha_pagamento_id ? Number(body.linha_pagamento_id) : null,
    especificacao: body.especificacao || '',
    numero_requisicao: body.numero_requisicao || '',
    numero_cheque: body.numero_cheque || '',
    numero_talao: body.numero_talao || '',
    quantidade,
    valor_unitario: valorUnitario,
    valor_total: valorTotal,
    atualizado_em: new Date().toISOString()
  });

  writeDb(db);
  setFlash(req, 'sucesso', 'Lançamento atualizado com sucesso.');
  res.redirect('/lancamentos');
});

app.post('/lancamentos/:id/apagar', requireRoles('admin'), (req, res) => {
  const db = readDb();
  db.lancamentos = db.lancamentos.filter(i => i.id !== Number(req.params.id));
  writeDb(db);
  setFlash(req, 'sucesso', 'Lançamento apagado com sucesso.');
  res.redirect('/lancamentos');
});

app.get('/configuracoes', requireRoles('admin'), (req, res) => {
  const db = readDb();
  res.render('configuracoes', {
    title: 'Configurações',
    configs: [...db.configuracoes_financeiras].sort((a, b) => b.ano - a.ano)
  });
});

app.post('/configuracoes', requireRoles('admin'), (req, res) => {
  const db = readDb();
  const ano = Number(req.body.ano);
  let item = db.configuracoes_financeiras.find(i => i.ano === ano);

  if (!item) {
    item = { id: nextId(db.configuracoes_financeiras), ano, transporte_banco: 0, transporte_caixa: 0 };
    db.configuracoes_financeiras.push(item);
  }

  item.transporte_banco = Number(req.body.transporte_banco || 0);
  item.transporte_caixa = Number(req.body.transporte_caixa || 0);

  writeDb(db);
  setFlash(req, 'sucesso', 'Transportes do ano guardados com sucesso.');
  res.redirect('/configuracoes');
});

app.get('/cadastros', requireRoles('admin'), (req, res) => {
  const db = readDb();
  res.render('cadastros', {
    title: 'Cadastros',
    ...loadFormData(db)
  });
});

app.post('/cadastros/:tipo', requireRoles('admin'), (req, res) => {
  const db = readDb();
  const nome = (req.body.nome || '').trim();

  if (!nome) {
    setFlash(req, 'erro', 'Digite um nome válido.');
    return res.redirect('/cadastros');
  }

  const map = {
    departamentos: 'departamentos',
    zonas: 'zonas',
    entradas: 'propositos_entrada',
    saidas: 'propositos_saida',
    linhas: 'linhas_pagamento'
  };

  const key = map[req.params.tipo];
  if (!key) return res.redirect('/cadastros');

  if (!db[key].find(i => i.nome.toLowerCase() === nome.toLowerCase())) {
    db[key].push({ id: nextId(db[key]), nome, ativo: true });
    writeDb(db);
  }

  setFlash(req, 'sucesso', 'Cadastro guardado com sucesso.');
  res.redirect('/cadastros');
});

app.get('/usuarios', requireRoles('admin'), (req, res) => {
  const db = readDb();
  res.render('usuarios', {
    title: 'Usuários',
    users: db.users
  });
});

app.post('/usuarios', requireRoles('admin'), async (req, res) => {
  const db = readDb();
  const hash = await bcrypt.hash(req.body.senha, 10);

  db.users.push({
    id: nextId(db.users),
    nome: req.body.nome,
    username: req.body.username,
    senha_hash: hash,
    perfil: req.body.perfil,
    ativo: true
  });

  writeDb(db);
  setFlash(req, 'sucesso', 'Usuário criado com sucesso.');
  res.redirect('/usuarios');
});

app.get('/relatorios', requireAuth, (req, res) => {
  const db = readDb();
  const ano = Number(req.query.ano || new Date().getFullYear());
  const mes = req.query.mes || '';

  const report = buildReport(db, ano, mes);

  res.render('relatorios', {
    title: 'Relatórios',
    user: req.session.user,
    flash: req.session.flash || null,
    ...report
  });
});
app.get('/relatorios/exportar.csv', requireAuth, (req, res) => {
  const db = readDb();
  const ano = Number(req.query.ano || new Date().getFullYear());
  const mes = req.query.mes || '';

  const report = buildReport(db, ano, mes);
  const csv = reportRowsToCsv(report.rows);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=relatorio-${report.ano}${report.mes ? '-' + report.mes : ''}.csv`);
  res.send('\uFEFF' + csv);
});

app.get('/relatorios/exportar.xls', requireAuth, (req, res) => {
  const db = readDb();
  const ano = Number(req.query.ano || new Date().getFullYear());
  const mes = req.query.mes || '';

  const report = buildReport(db, ano, mes);
  const html = reportRowsToExcelHtml(report);

  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=relatorio-${report.ano}${report.mes ? '-' + report.mes : ''}.xls`);
  res.send(html);
});

app.get('/relatorios/imprimir', requireAuth, (req, res) => {
  const db = readDb();
  const ano = Number(req.query.ano || new Date().getFullYear());
  const mes = req.query.mes || '';

  const report = buildReport(db, ano, mes);
  res.send(reportHtml(report));
});

app.listen(PORT, async () => {
  await seed();
  console.log(`Servidor em http://localhost:${PORT}`);
});