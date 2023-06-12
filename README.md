# automatic-lnd-invoices

## requirements:

 - Node JS (https://nodejs.org/en/download)
 - MySQL or other SQL database (https://www.mysql.com/en/downloads/)
 - LND (https://github.com/lightningnetwork/lnd/releases) 
 
## Node JS required packages:

 - mysql (for interfacing with the SQL database)
 - moment (timestamps)
 - axios (https requests)
 - chai (testing)
 
```bash
	npm i mysql moment axios chai
```

 - mocha (testing)
```bash
	sudo npm install mocha --save-dev
```

## LND node setup:

After having downloaded the binaries, extract them and copy them to a directory that is on your ```PATH``` variable environment, for example:

```
	sudo cp lnd lncli /usr/local/bin/
```

You'll need to setup your LND node, which can run connected to your own Bitcoin Full Node or dependant on peer nodes (Neutrino LND).

Here is a sample ```lnd.conf``` file (On linux path is under: ```$HOME/.lnd/lnd.conf```):

```
	[Bitcoin]
	bitcoin.active=1
	bitcoin.testnet=1
	bitcoin.node=neutrino
```
Run your LND instance with ```lnd```, then -on a separate terminal-,
setup your LND wallet by running:

```bash
	lncli create
```

and follow the instructions.
After that you might need to unlock your wallet:

```bash
	lncli unlock
```

Generate a macaroon token with the command:

```bash
	lncli bakemacaroon invoices:write invoices:read
```

The generated token is essential so make sure to save it.

**NOTE:** if you enabled the testnet option you'll want to add ```--macaroonpath=YOUR_ADMIN_MACAROON_PATH``` to every lncli command you issue.

## MySQL setup:

Install MySQL and create a database.
The database must contain a table with the following schema:

```
	CREATE IF NOT EXISTS TABLE invoices (
		id INT PRIMARY KEY AUTO_INCREMENT,
		payment_request VARCHAR(512),
		r_hash VARCHAR(512),
		expiry TIMESTAMP,
		value INT,
		status VARCHAR(10) DEFAULT "unpaid"
	);
```

Then create a user with read and write privileges on the *"invoices"* table.

## config.json:

Replace the sample values in the configuration files with your paramenters.

	- *"mysql"* contains the necessary information for the access to the database;
	- *"lndApiUrl"* contains the exact URL at which the LND node is reachable, for local installations it's ```https://localhost:8080```
	- *"certificate"* is not mandatory and -if provided- tells axios to use a specific certificate.
 
