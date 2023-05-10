const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const bodyparser = require("body-parser");
const Sentry = require("@sentry/node");
const { createInvoice } = require("./createInvoice.js");
const { createEmailTemplate } = require("./createEmailTemplate");
const uuid = require("uuid").v4;
const fs = require("fs");
const cors = require("cors");
const { storeItems } = require("./storeItems.js");
const admin = require("firebase-admin");
const credentials = require("./key.json");
const nodemailer = require("nodemailer");

admin.initializeApp({ credential: admin.credential.cert(credentials) });
const db = admin.firestore();
const app = express();
app.use(cors());
app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());
const PORT = 5500;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
});

function formatDate(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return day + "." + month + "." + year;
}

app.post("/checkout", async (req, res) => {
  let error, status;

  try {
    const { token, package, discount, isForex } = req.body;
    const stripe = require("stripe")(
      isForex
        ? process.env.STRIPE_PRIVATE_KEY_FOREX
        : process.env.STRIPE_PRIVATE_KEY_STAVKOVE
    );

    const customer = await stripe.customers.create({
      email: token.email,
      source: token.id,
    });

    const storeItem = storeItems.get(package.id);

    const key = uuid();
    const charge = await stripe.charges.create({
      amount: Math.round(
        storeItem.priceInCents - storeItem.priceInCents * discount
      ),
      currency: "eur",
      customer: customer.id,
      receipt_email: token.email,
      description: storeItem.name,
      key: key,
    });

    async function sendEmail() {
      var invoiceNumber = 0;
      const transaction = Sentry.startTransaction({
        op: "sendEmail",
        name: "sendEmail",
      });
      try {
        const docRef = await db
          .collection("cislo-objednavky")
          .doc("invoiceNumber");
        var order = await db
          .collection("cislo-objednavky")
          .doc("invoiceNumber")
          .get();
        invoiceNumber = "0" + order.data().number;
        await docRef.set({
          number: order.data().number + 1,
        });
      } catch (err) {
        Sentry.captureException(err);
        console.log(err);
      } finally {
        transaction.finish();
      }

      const htmlMessage = createEmailTemplate({
        name: token.card.name,
        invoiceNumber: invoiceNumber,
        isForex: isForex,
        storeItem: {
          ...storeItem,
          priceInCents:
            storeItem.priceInCents - storeItem.priceInCents * discount,
        },
        email: token.email,
        address: {
          street: token.card.address_line1,
          zip: token.card.address_zip,
          city: token.card.address_city,
          country: token.card.address_country,
        },
      });
      const invoice = {
        shipping: {
          name: token.card.name,
          address: token.card.address_line1,
          city: token.card.address_city,
          postal_code: token.card.address_zip,
          email: token.email,
        },
        items: [
          {
            item: storeItem.name,
            quantity: 1,
            amount: storeItem.priceInCents,
            duration: storeItem.duration,
          },
        ],
        subtotal: storeItem.priceInCents,
        discountValue: Math.round(storeItem.priceInCents * discount),
        discountPercent: discount * 100,
        invoice_nr: invoiceNumber,
        pageType: isForex ? "forex" : "stavkove",
      };
      createInvoice(invoice, `faktura č.${invoiceNumber + ".pdf"}`);
      try {
        const docRef = db
          .collection(`objednávky-${isForex ? "forex" : "stavkove"}`)
          .doc(String(invoiceNumber));
        await docRef.set({
          id: key,
          číslo: invoiceNumber,
          meno: token.card.name,
          adresa: token.card.address_line1,
          mesto: token.card.address_city,
          PSČ: token.card.address_zip,
          balik: storeItem.name,
          dátum: formatDate(new Date()),
        });
      } catch (err) {
        Sentry.captureException(err);
        console.log(err);
      }

      let transporter = nodemailer.createTransport({
        host: "smtp.m1.websupport.sk",
        port: 465,
        secure: true,
        auth: {
          user: isForex
            ? "info@forexporadenstvo.sk"
            : "info@stavkoveporadenstvo.sk",
          pass: process.env.ACOUNT_PASSWORD,
        },
      });

      let info = await transporter.sendMail({
        from: isForex
          ? `"Objednávka č. ${invoiceNumber} | Forex Poradenstvo" <info@forexporadenstvo.sk>`
          : `"Objednávka č. ${invoiceNumber} | Stavkove Poradenstvo" <info@stavkoveporadenstvo.sk>`,
        to: token.email,
        subject: "Vaša Objednávka",
        html: htmlMessage,
        bcc: isForex
          ? "info@forexporadenstvo.sk"
          : "info@stavkoveporadenstvo.sk",
        attachments: [
          {
            filename: `faktura č.${invoiceNumber + ".pdf"}`,
            path: `faktura č.${invoiceNumber + ".pdf"}`,
            contentType: "application/pdf",
            send: true,
          },
          {
            filename: "stavkove.png",
            path: "./stavkove.png",
            cid: "stavkove",
            send: !isForex,
          },
          {
            filename: "forex.png",
            path: "./forex.png",
            cid: "forex",
            send: isForex,
          },
        ].filter((i) => i.send),
      });

      console.log("Odoslané: %s", JSON.stringify(info, null, 2));
      Sentry.captureMessage(info);
    }

    sendEmail().catch((err) => {
      Sentry.captureException(err);
      console.log(err);
    });

    status = "success";
  } catch (err) {
    Sentry.captureException(err);
    console.log(err);
    status = "failure";
    return;
  }

  res.json({ error, status });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
