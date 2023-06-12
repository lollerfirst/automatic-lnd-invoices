const {generateInvoice, getInvoice} = require("./lnd-invoices");
const chai = require('chai');

var stored_r_hash;

describe('generateInvoice', () => {
    it('should generate and display invoice information', async () => {
      // Test input
      const amount = 100;
      const product = 'Test Product';
  
      // Generate the invoice
      const invoice = await generateInvoice(amount, product);
  
      // Assertion: Check if invoice information is returned
      chai.expect(invoice).to.be.an('object');
      chai.expect(invoice.payment_request).to.be.a('string');
      chai.expect(invoice.r_hash).to.be.a('string');
      chai.expect(invoice.expiry).to.be.a('number');
      chai.expect(invoice.memo).to.be.a('string');
  
      // Display the invoice information
      console.log('Generated Invoice:');
      console.log('Payment Request:', invoice.payment_request);
      console.log('R Hash:', invoice.r_hash);
      console.log('Expiry:', invoice.expiry);
      console.log('Memo:', invoice.memo);

      // Save r_hash
      stored_r_hash = invoice.r_hash;
    });
  });

describe('getInvoice', () => {
    it('should retrieve and display the requested invoice information', async () => {
  
      // Retrieve the invoice
      const invoice = await getInvoice(stored_r_hash);
  
      // Assertion: Check if invoice information is returned
      chai.expect(invoice).to.be.an('object');
      chai.expect(invoice.payment_request).to.be.a('string');
      chai.expect(invoice.r_hash).to.be.a('string');
      chai.expect(invoice.expiry).to.be.a('number');
      chai.expect(invoice.memo).to.be.a('string');
  
      // Display the invoice information
      console.log('Generated Invoice:');
      console.log('Payment Request:', invoice.payment_request);
      console.log('R Hash:', invoice.r_hash);
      console.log('Expiry:', invoice.expiry);
      console.log('Memo:', invoice.memo);
    });
  });