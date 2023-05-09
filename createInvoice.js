const fs = require("fs");
const PDFDocument = require("pdfkit");
const Sentry = require("@sentry/node");
const path = require("path");

const fontMediumPath = path.join(__dirname, "Roboto-Medium.ttf");
const fontBoldPath = path.join(__dirname, "Roboto-Bold.ttf");

function createInvoice(invoice, path) {
  try {
    let doc = new PDFDocument({ size: "A4", margin: 50 });
    generateHeader(doc, invoice);
    generateCustomerInformation(doc, invoice);
    generateInvoiceTable(doc, invoice);
    generateFooter(doc);
    doc.end();
    doc.pipe(fs.createWriteStream(path));
  } catch (err) {
    Sentry.captureException(err);
    console.log(err);
  }
}

function generateHeader(doc, invoice) {
  const imagePath = path.join(__dirname, `${invoice.pageType}.png`);
  doc
    .rect(50, 40, 120, 40)
    .fill(`${invoice.pageType === "forex" ? "#463acc" : "#3b055b"}`)
    .image(imagePath, 60, 45, {
      width: 100,
      align: "center",
      valign: "center",
    })
    .fillColor("#444444")
    .font(fontMediumPath)
    .fontSize(10)
    .fillColor("#aaaaaa")
    .text("DODÁVATEĽ", 50, 95)
    .fillColor("#000000")
    .text("DIGITAL G s.r.o", 50, 110)
    .text("Cintorínska 187/11", 50, 125)
    .text("031 04 Liptovský Mikuláš", 50, 140)
    .text("IČO: 54103363", 50, 155)
    .text("DIČ: 2121576897", 50, 170)
    .fillColor("#aaaaaa")
    .text("ODOBERATEĽ", 250, 95)
    .font(fontBoldPath)
    .fillColor("#000000")
    .text(invoice.shipping.name, 250, 110)
    .font(fontMediumPath)
    .text(invoice.shipping.address, 250, 125)
    .text(
      `${invoice.shipping.postal_code + ", " + invoice.shipping.city}`,
      250,
      140
    )
    .text(invoice.shipping.email, 250, 155)
    .moveDown();
}

function generateCustomerInformation(doc, invoice) {
  doc
    .fillColor("#444444")
    .fontSize(20)
    .font(fontMediumPath)
    .text("Faktúra", 50, 205);

  generateHr(doc, 235);

  const customerInformationTop = 240;

  doc
    .fontSize(10)
    .text("Číslo:", 50, customerInformationTop)
    .font(fontBoldPath)
    .text(invoice.invoice_nr, 150, customerInformationTop)
    .font(fontMediumPath)
    .text("Dátum vystavenia:", 50, customerInformationTop + 15)
    .text(formatDate(new Date(), 0), 150, customerInformationTop + 15)
    .text("Dátum dodania:", 50, customerInformationTop + 30)
    .text(formatDate(new Date(), 0), 150, customerInformationTop + 30)
    .text("Dátum splatnosti:", 50, customerInformationTop + 45)
    .text(formatDate(new Date(), 14), 150, customerInformationTop + 45)
    .text(
      "Úhrada bola vykonaná cez platobnú bránu STRIPE. Služba je dodávaná v digitálnej podobe.",
      50,
      customerInformationTop + 70,
      {
        align: "center",
      }
    );

  generateHr(doc, 337);
}

function generateInvoiceTable(doc, invoice) {
  let i;
  const invoiceTableTop = 360;

  doc.font(fontBoldPath);
  generateTableRow(
    doc,
    invoiceTableTop,
    "Názov Produktu",
    "Trvanie",
    "Počet",
    "Cena bez DPH",
    "DPH",
    "Spolu s DPH"
  );
  generateHr(doc, invoiceTableTop + 20);
  doc.font(fontMediumPath);

  for (i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i];
    const position = invoiceTableTop + (i + 1) * 30;
    generateTableRow(
      doc,
      position,
      item.item,
      item.duration,
      item.quantity,
      formatCurrency(item.amount * 0.8),
      "20%",
      formatCurrency(item.amount)
    );

    generateHr(doc, position + 20);
  }

  const subtotalPosition = invoiceTableTop + (i + 1) * 30;
  generateTableRow(
    doc,
    subtotalPosition,
    "",
    "",
    "",
    "Základ DPH 20%",
    "",
    formatCurrency(invoice.subtotal * 0.8)
  );

  const paidToDatePosition = subtotalPosition + 20;
  generateTableRow(
    doc,
    paidToDatePosition,
    "",
    "",
    "",
    "DPH 20%",
    "",
    formatCurrency(invoice.subtotal * 0.2)
  );
  const discountPosition = paidToDatePosition + 20;
  generateTableRow(
    doc,
    discountPosition,
    "",
    "",
    "",
    `Zľava ${invoice.discountPercent + "%"}`,
    "",
    formatCurrency(invoice.discountValue)
  );

  const duePosition = paidToDatePosition + 40;
  doc.font(fontBoldPath);
  generateTableRow(
    doc,
    duePosition,
    "",
    "",
    "",
    "Celkom",
    "",
    formatCurrency(invoice.subtotal - invoice.discountValue)
  );

  doc.font("Helvetica");
}

function generateFooter(doc) {
  doc.font(fontBoldPath).fontSize(10).text("Strana 1/1", 50, 780, {
    align: "center",
    width: 500,
  });
}

function generateTableRow(
  doc,
  y,
  item,
  duration,
  description,
  unitCost,
  quantity,
  lineTotal
) {
  doc
    .fontSize(10)
    .text(item, 50, y)
    .text(duration, 170, y)
    .text(description, 250, y)
    .text(unitCost, 310, y, { width: 90, align: "left" })
    .text(quantity, 370, y, { width: 90, align: "right" })
    .text(lineTotal, 0, y, { align: "right" });
}

function generateHr(doc, y) {
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
}

function formatCurrency(cents) {
  return (cents / 100).toFixed(2) + "€";
}

function formatDate(date, plusDays) {
  date.setDate(date.getDate() + plusDays);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return day + "." + month + "." + year;
}

module.exports = {
  createInvoice,
};
