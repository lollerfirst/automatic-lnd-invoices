const mysql = require('mysql2/promise');
const moment = require('moment');
const axios = require('axios');
const https = require('https')
const fs = require('fs');

const configPath = './config.json';
const configData = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configData);

if (typeof config.certificate !== 'undefined') {
	axios.defaults.httpsAgent = new https.Agent({
		rejectUnauthorized: config.certificate.signed,
		cert: fs.readFileSync(config.certificate.path)
	});
} else {
	axios.defaults.httpsAgent = new https.Agent({
		rejectUnauthorized: false,
	});
}

console.log('Loaded configuration:', config);

const pool = mysql.createPool(config.mysql);
setInterval(checkInvoices, 60000);

/*
connection.connect().catch((err) => {
	console.error('Error connecting to database:', err.code);
	console.error('Error description:', err.sqlMessage);
}).then(() => {
	console.log('Connected to the database!');
*/

const lndApiUrl = config.lndApiUrl;
const macaroon = config.macaroon;
/*
String.prototype.hexEncode = function(){
	var hex, i;

	var result = "";
	for (i=0; i<this.length; i++) {
		hex = this.charCodeAt(i).toString(16);
		result += ("000"+hex).slice(-4);
	}

	return result
}
*/

async function makeLndRequest(url, method, data) {
	try {
		const response = await axios({
			url: `${lndApiUrl}/${url}`,
			method: method,
			data: data,
			headers: {
				'Grpc-Metadata-macaroon': macaroon,
				'Content-Type': 'application/json',
			},
		});

		return response.data;
	} catch (error) {
		console.error('LND API request failed:', error);
		throw error;
	}
}

async function checkInvoices() {
  let connection;

  try {
    connection = await pool.getConnection();
  } catch (error) {
    console.error('[checkInvoices] Couldn\'t get connection from pool', error);
    throw error;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const currentFormattedTimestamp = moment.unix(currentTimestamp).format('YYYY-MM-DD HH:mm:ss');

  const deleteQuery = 'DELETE FROM invoices WHERE expiry < ? AND status = "unpaid"';

  try {
    const [deleteResult] = await connection.execute(deleteQuery, [currentFormattedTimestamp]);
    console.log('Expired invoices deleted:', deleteResult.affectedRows);
  } catch (err) {
    console.error('Error on deleteQuery:', err);
    throw err;
  }

  const unpaidQuery = 'SELECT r_hash FROM invoices WHERE status = "unpaid"';
  let unpaidResult;

  try {
    [unpaidResult] = await connection.execute(unpaidQuery);
    console.log('unpaidQuery successful');
  } catch (err) {
    console.error('Error unpaidQuery:', err);
    throw err;
  }

  console.log('Number of unpaid invoices:', unpaidResult.length);
  const unpaidInvoices = unpaidResult.map(row => row.r_hash);
  let paidInvoices = [];

  for (const r_hash of unpaidInvoices) {
    try {
      const checkPaymentRequest = await makeLndRequest(`v1/invoices/${r_hash}`, 'GET', {});

      if (checkPaymentRequest.data.settled) {
        console.log(`Invoice with r_hash ${r_hash} has been paid.`);
        paidInvoices.push(r_hash);
      }
    } catch (err) {
      console.error('Error checking payment status:', err);
      throw err;
    }
  }

  if (paidInvoices.length > 0) {
    const updateQuery = 'UPDATE invoices SET status = "paid" WHERE r_hash IN (?)';

    try {
      const updateResult = await connection.execute(updateQuery, [paidInvoices]);
      console.log('updateQuery successful:', updateResult.affectedRows);
    } catch (err) {
      console.error('Error updateQuery:', err);
      throw err;
    }
  }
}


async function getInvoice(r_hash) {
	let connection;
	
	try {
		connection = await pool.getConnection();
	} catch (error) {
		console.error('[checkInvoices] Couldn\'t get connection from pool', error);
		throw error;
	}

	const getInvoiceQuery = 'SELECT * FROM invoices WHERE r_hash = ?';

	try {
		const [getInvoiceResult] = await connection.execute(getInvoiceQuery, [r_hash]);
		console.log('getInvoice successful');
		return getInvoiceResult;
	}
	catch (err) {
		console.error('Error in getInvoiceQuery:', err);
		throw err;
	}
}

async function insertInvoice(invoice, amount, expiry, memo) {
	let connection;
	
	try {
		connection = await pool.getConnection();
	} catch (error) {
		console.error('[checkInvoices] Couldn\'t get connection from pool', error);
		throw error;
	}

	const { payment_request, r_hash } = invoice;

	expiry += Math.floor(Date.now() / 1000);
	const expiryFormatted = moment.unix(expiry).format('YYYY-MM-DD HH:mm:ss');

	const insertQuery = 'INSERT INTO invoices (payment_request, value, memo, r_hash, expiry, status) VALUES (?, ?, ?, ?, ?, "unpaid")';

	try {
		const result = await connection.execute(insertQuery, [payment_request, amount, memo, r_hash, expiryFormatted]);
		console.log('insertQuery successful:', result.affectedRows);
	}
	catch (err) {
		console.error('Error in insertQuery:', err);
		throw err;
	}

}

async function generateInvoice(amount, product) {

	const expiry = 3600;
	const memo = `Invoice for ${product}`;

	try {
		const invoiceResponse = await makeLndRequest('v1/invoices', 'POST', {
			value: amount,
			memo: memo,
			expiry: expiry
		});

		await insertInvoice(invoiceResponse, amount, expiry, memo);

		console.log('Invoice generated and stored:', invoiceResponse);

		return {
			r_hash: invoiceResponse.r_hash, payment_request: invoiceResponse.payment_request, value: amount,
			memo: `Invoice for ${product}`, expiry: expiry
		};

	}
	catch (err) {
		console.error('Error while generating invoice:', err);
		throw err;
	}
}

module.exports = {
	generateInvoice,
	getInvoice
};
