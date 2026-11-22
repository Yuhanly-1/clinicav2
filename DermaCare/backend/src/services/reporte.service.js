const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');

const NAVY = '0A2540';
const BLUE = '0284C7';

/** Crea un libro Excel con encabezado corporativo y la tabla de datos. */
async function buildExcel({ titulo, filtros, columns, rows, usuario }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DermaCare';
  wb.created = new Date();
  const ws = wb.addWorksheet(titulo.slice(0, 30));

  ws.mergeCells(1, 1, 1, columns.length);
  ws.getCell(1, 1).value = `DermaCare — ${titulo}`;
  ws.getCell(1, 1).font = { size: 16, bold: true, color: { argb: 'FF' + NAVY } };
  ws.mergeCells(2, 1, 2, columns.length);
  ws.getCell(2, 1).value = `Generado por ${usuario} · ${new Date().toLocaleString('es-DO')} · ${filtros}`;
  ws.getCell(2, 1).font = { size: 10, italic: true, color: { argb: 'FF64748B' } };

  const header = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
    cell.alignment = { vertical: 'middle' };
    ws.getColumn(i + 1).width = c.width || 18;
  });
  header.height = 20;

  rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    columns.forEach((c, i) => {
      row.getCell(i + 1).value = r[c.key] === null || r[c.key] === undefined ? '' : r[c.key];
    });
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    }
  });
  ws.getRow(6 + rows.length).getCell(1).value = `Total de registros: ${rows.length}`;
  ws.getRow(6 + rows.length).getCell(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return wb;
}

async function sendExcel(res, filename, wb) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

/** Documento PDF con encabezado corporativo. */
function startPdf(res, filename, titulo, subtitulo) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: titulo, Author: 'DermaCare' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.rect(0, 0, doc.page.width, 70).fill('#' + NAVY);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('DermaCare', 40, 22);
  doc.font('Helvetica').fontSize(10).fillColor('#38BDF8').text('Clínica Dermatológica', 40, 46);
  doc.fillColor('#' + NAVY).font('Helvetica-Bold').fontSize(15).text(titulo, 40, 90);
  doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(subtitulo, 40, 110);
  doc.moveDown(1.5);
  return doc;
}

function finishPdf(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // permite escribir el pie sin crear páginas en blanco
    doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
      .text(`DermaCare · Documento confidencial · Página ${i + 1} de ${range.count}`, 40, doc.page.height - 30, {
        align: 'center', width: doc.page.width - 80, lineBreak: false,
      });
  }
  doc.end();
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - 50) doc.addPage();
}

function sectionTitle(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#' + BLUE).text(text, 40);
  doc.moveDown(0.3);
}

/** Tabla simple de dos columnas (etiqueta / valor). */
function kvTable(doc, pairs) {
  pairs.forEach(([k, v]) => {
    ensureSpace(doc, 18);
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor('#475569').text(k, 50, y, { width: 260 });
    doc.font('Helvetica-Bold').fillColor('#0F172A').text(String(v), 320, y, { width: 200 });
    doc.moveDown(0.4);
  });
}

async function serverToday() {
  return (await query('SELECT CURRENT_DATE::text AS hoy')).rows[0].hoy;
}

module.exports = { buildExcel, sendExcel, startPdf, finishPdf, ensureSpace, sectionTitle, kvTable, serverToday };
