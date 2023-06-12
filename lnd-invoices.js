const mysql = require('mysql');
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

const connection = mysql.createConnection(config.mysql);

connection.connect((err) => {
	if (err) {
		console.error('Error connecting to database:', err.code);
		console.error('Error description:', err.sqlMessage);
	} else {
		console.log('Connected to the database!');
		setInterval(checkInvoices, 60000);
	}
});

const lndApiUrl = config.lndApiUrl;
const macaroon = config.macaroon;

String.prototype.hexEncode = function(){
    var hex, i;

    var result = "";
    for (i=0; i<this.length; i++) {
        hex = this.charCodeAt(i).toString(16);
        result += ("000"+hex).slice(-4);
    }

    return result
}

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
	const currentTimestamp = Math.floor(Date.now() / 1000);
	const currentFormattedTimestamp = moment.unix(currentTimestamp).format('YYYY-MM-DD HH:mm:ss');

	const deleteQuery = 'DELETE FROM invoices WHERE expiry < ? AND status = "unpaid"';
	const deleteResult = await connection.query(deleteQuery, [currentFormattedTimestamp]);

	console.log('Expired invoices deleted:', deleteResult.affectedRows);

	const unpaidQuery = 'SELECT r_hash FROM invoices WHERE status = "unpaid"';
	const unpaidResult = await connection.query(unpaidQuery);

	console.log('Number of unpaid invoices:', unpaidResult.length);
	const unpaidInvoices = Array.isArray(unpaidResult) ? unpaidResult.map(row => row.r_hash) : [];
	const paidInvoices = [];

	for (const r_hash of unpaidInvoices) {
		const requestHash = JSON.stringify({ r_hash_str: r_hash });

		try {
			const checkPaymentRequest = await makeLndRequest(`v1/invoice/${requestHash}`, 'GET', {});

			if (checkPaymentRequest.data.settled) {
				console.log(`Invoice with r_hash ${r_hash} has been paid.`);
				paidInvoices.push(r_hash);
			}
		} catch (error) {
			console.error('Error checking payment status:', error);
		}
	}

	if (paidInvoices.length > 0) {
		const updateQuery = 'UPDATE invoices SET status = "paid" WHERE r_hash IN ?';
		const updateResult = await connection.query(updateQuery, [paidInvoices]);

		console.log('Invoices updated:', updateResult.affectedRows);
	}
}

async function getInvoice(r_hash) {
	try
	{
		const getInvoiceQuery = 'SELECT * FROM invoices WHERE r_hash = ?';
		const response = await connection.query(getInvoiceQuery, r_hash);
		return response;
	}
	catch (error)
	{
		console.error('Error while retrieving invoice information:', error);
	}
}

async function insertInvoice(invoice, amount, expiry, memo) {
	const { payment_request, r_hash } = invoice;

	expiry += Math.floor(Date.now() / 1000);
	const expiryFormatted = moment.unix(expiry).format('YYYY-MM-DD HH:mm:ss');

	const query = 'INSERT INTO invoices (payment_request, value, memo, r_hash, expiry, status) VALUES (?, ?, ?, ?, ?, "unpaid")';
	await connection.query(query, [payment_request, amount, memo, r_hash, expiryFormatted], (err, result) => {
		if (err) {
			console.error('Error executing query:', err);
			return;
		} else {
			console.log('Invoice inserted:', result);
		}
	});
}

async function generateInvoice(amount, product) {

	const expiry = 3600;
	const memo = `Invoice for ${product}`;

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

module.exports = {
	generateInvoice,
	getInvoice
};
