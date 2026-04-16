PROJECTO FINAL - FINANÇAS DA IGREJA
==================================

COMO INSTALAR
1. Extraia o ficheiro zip.
2. Abra a pasta igreja-financas-site-v3.
3. No terminal dessa pasta use:
   npm.cmd install
   npm.cmd start
4. Abra no navegador: http://localhost:3000

UTILIZADORES INICIAIS
- admin / 123456
- tesoureiro / 123456
- visualizador / 123456

O QUE ESTE PROJECTO JÁ TEM
- Login com perfis
- Dashboard com resumo de Banco e Caixa
- Gráficos de movimento e gráfico mensal
- Lançamentos de Entrada, Saida e Transporte
- Departamentos, zonas, propósitos e linhas por seleção
- Boa Esperança e Igreja em Geral padronizados
- Configuração de transporte por ano
- Relatório tipo Excel
- Exportação CSV
- Exportação Excel (.xls)
- Exportação PDF por impressão do navegador
- Logo da igreja e cores alinhadas ao logo
- Dados guardados em data/db.json

COMO EXPORTAR
- CSV: Relatórios > botão CSV
- Excel: Relatórios > botão Excel
- PDF: Relatórios > botão PDF e depois Guardar como PDF / Imprimir

BACKUP
Faça cópia deste ficheiro:
- data/db.json

COMO COLOCAR ONLINE
A forma mais simples é usar Render ou Railway.

RENDER
1. Crie conta.
2. Crie um novo Web Service.
3. Envie esta pasta para GitHub.
4. Ligue o repositório no Render.
5. Configure:
   - Build Command: npm install
   - Start Command: npm start
6. Defina a variável de ambiente:
   - NODE_ENV=production
7. O sistema abrirá num link público.

IMPORTANTE
- O projecto usa PORT automaticamente, então já está preparado para hospedagem.
- Depois de publicar, troque a senha do admin.
