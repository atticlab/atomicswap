/******************************************************************************/
/* Project:     CC Swap                                                       */
/* Author:      Kostiantyn Chertov        Creation Date: 01/02/18             */
/* Filename:    btc-dsh.js                Language: JavaScript                */
/*                                                                            */
/******************************************************************************/
/* Module Details:                                                            */
/* Atomic Swap BTC<=>DSH test                                                 */
/******************************************************************************/
/* Version No: 1.00                                                           */
/* Date: February 9, 2018                                                     */
/******************************************************************************/
/* Release history:                                                           */
/*                                                                            */
/* Version No: 1.00 Feb-09-2018                                               */
/*   Full test for atomic swap BTC<=>DSH                                      */
/* Version No: 0.03 Feb-07-2018                                               */
/*   Modification for 3-node testnet                                          */
/* Version No: 0.02 Feb-05-2018                                               */
/*   Test account separated from mining, awaiting for tx confirmation added   */
/* Version No: 0.01 Feb-01-2018                                               */
/*   Initial release                                                          */
/******************************************************************************/

/*jshint esversion: 6 */

const DEBUG = 0;
const LOOPS = 1;

var child_process = require('child_process');
var os = require('os');
var sleep = require('system-sleep');

//const BTCNetwork = bitcoin.networks.testnet;

const HOME = '/home/dev/swap';

const BtcTestboxPath = HOME + '/bitcoin-testnet-box';
const DshTestboxPath = HOME + '/dash-testnet-box';

const GoBtcLibPath = HOME + '/atomicswap/cmd/btcatomicswap';
const GoDshLibPath = HOME + '/atomicswap/cmd/dshatomicswap';

const SATOSHI = 100000000; //1 BTC

const SwapAmountBtc = 0.1;
const SwapAmountDsh = 1.5;

const SwapFeeBtc = 0.1;
const SwapFeeDsh = 0.1;

const TestCasesNumber = 8;

const MinBalanceBtc1 = TestCasesNumber * (SwapAmountBtc + SwapFeeBtc) * LOOPS + 1; //+1 BTC 
const MinBalanceBtc2 = 2;

const MinBalanceDsh1 = 2;
const MinBalanceDsh2 = TestCasesNumber * (SwapAmountDsh + SwapFeeDsh) * LOOPS + 1;

const BtcM = Object.freeze({
    net: 'btc',
    client: 'bitcoin-cli',
    dir: 'M',
    host: '127.0.0.1',
    port: '19001', 
    user: 'adminM',
    pwd: '123',
    path: BtcTestboxPath
 });
const Btc1 = Object.freeze({
    net: 'btc',
    client: 'bitcoin-cli',
    dir: '1',
    host: '127.0.0.1',
    port: '19011', 
    user: 'admin1',
    pwd: '123',
    path: BtcTestboxPath
 });
const Btc2 = Object.freeze({
    net: 'btc',
    client: 'bitcoin-cli',
    dir: '2',
    host: '127.0.0.1',
    port: '19021', 
    user: 'admin2',
    pwd: '123',
    path: BtcTestboxPath
});
const DshM = Object.freeze({
    net: 'dsh',
    client: 'dash-cli',
    dir: 'M',
    host: '127.0.0.1',
    port: '19101', 
    user: 'adminM',
    pwd: '123',
    path: DshTestboxPath
 });
const Dsh1 = Object.freeze({
    net: 'dsh',
    client: 'dash-cli',
    dir: '1',
    host: '127.0.0.1',
    port: '19111', 
    user: 'admin1',
    pwd: '123',
    path: DshTestboxPath
 });
const Dsh2 = Object.freeze({
    net: 'dsh',
    client: 'dash-cli',
    dir: '2',
    host: '127.0.0.1',
    port: '19121', 
    user: 'admin2',
    pwd: '123',
    path: DshTestboxPath
});

const RefundConsts = Object.freeze({
    feeName: 'Refund fee: ',
    txName: 'Refund transaction ('
});

const RedeemConsts = Object.freeze({
    feeName: 'Redeem fee:',
    txName: 'Redeem transaction ('
});

function tx_wait(sender, txid) {

    let count = 0;
    do {
        // wait a little...
        if (count > 1) {
            process.stdout.write('waiting for tx: ' + count.toString() + ' secs   \r');
        }
        sleep(1000);
        child_process.execSync('make generate', {
            cwd: sender.path,
            encoding: 'utf8',
        });            
        let txResult = child_process.execSync(''.concat(sender.client,' -datadir=', sender.dir, ' gettransaction ', txid), {
            cwd: sender.path,
            encoding: 'utf8',
        }).toString();
        count += 1;
        if (DEBUG == 1) {
            console.log('tx [', count, ']:                  ', txResult);
        }
        txInfo = JSON.parse(txResult);
    } while (txInfo.confirmations == 0);
    if (count > 2) {
        console.log('');
    }
}

function timelock_wait(waitSeconds, testboxPath, blocksPerSecond) {
    do {
        process.stdout.write('waiting for lock timeout: ' + waitSeconds.toString() + ' secs   \r');
        waitSeconds -= 1;
        sleep(1000);
        child_process.execSync('make generate BLOCKS='.concat(blocksPerSecond.toString()), {
            cwd: testboxPath,
            encoding: 'utf8',
        });            
    } while (waitSeconds > 0);
    process.stdout.write('                                      \r');
}

function balance_get(user) {
    
    let walletResult = child_process.execSync(''.concat(user.client, ' -datadir=', user.dir, ' getwalletinfo'), {
        cwd: user.path,
        encoding: 'utf8',
    }).toString();
    if (DEBUG == 1) {
        console.log('wallet [', user.net, user.dir, ']: ', walletResult);
    }
    if (typeof walletResult == undefined) {
        throw new Error('wallet info is absent');
    }
    let walletInfo = JSON.parse(walletResult);
    if (typeof walletInfo.balance == undefined) {
        throw new Error('balance not found in the wallet info');
    }
    return parseFloat(walletInfo.balance);
}


function balance_wait(user, amount) {
    let balance = balance_get(user);
    process.stdout.write('waiting for balance update\r');
    while (balance < amount) {
        child_process.execSync('make generate', {
            cwd: user.path,
            encoding: 'utf8',
        });            
        sleep(500);
        balance = balance_get(user);
    }
    process.stdout.write('                          \r');
}


function cmd(sender) {
    return './'.concat(sender.net, 'atomicswap --testnet --s ', sender.host, ':', sender.port, ' --rpcuser=', sender.user, ' --rpcpass=', sender.pwd);
}

function contract_parse(contractRes, initiateFlag) {

    const Str_Secret = 'Secret:';
    const Str_SecretHash = 'Secret hash:';
    const Str_ContractFee = 'Contract fee:';
    const Str_Btc = ' BTC ';
    const Str_RefundFee = 'Refund fee:';
    const Str_Contract = 'Contract (';
    const Str_Parenthesis = '):';
    const Str_ContractTransaction = 'Contract transaction (';
    const Str_RefundTransaction = 'Refund transaction (';

    contractInfo = contractRes.split(os.EOL);
    i = 0;
    si = '';
    if (initiateFlag) {
        // Secret
        ofs = -1;
        do {
            si = contractInfo[i].toString();
            ofs = si.indexOf(Str_Secret);
            i += 1;
        } while ((ofs == -1) && (i < contractInfo.length));
        if (ofs == -1) {
            throw new Error('field `' + Str_Secret + '` not found');
        }
        secretVal = si.substr(Str_Secret.length).trim();
        // Secret hash
        ofs = -1;
        do {
            si = contractInfo[i].toString();
            ofs = si.indexOf(Str_SecretHash);
            i += 1;
        } while ((ofs == -1) && (i < contractInfo.length));
        if (ofs == -1) {
            throw new Error('field `' + Str_SecretHash + '` not found');
        }
        secretHashVal = si.substr(Str_SecretHash.length).trim();
    } else {
        secretVal = '';
        secretHashVal = '';
    }
    // Contract fee
    ofs = -1;
    do {
        si = contractInfo[i].toString();
        ofs = si.indexOf(Str_ContractFee);
        i += 1;
    } while ((ofs == -1) && (i < contractInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_ContractFee + '` not found');
    }
    ofsEnd = si.indexOf(Str_Btc);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Btc + '` not found');
    }
    contractFeeVal = si.substring(Str_ContractFee.length, ofsEnd).trim();
    // Refund fee
    ofs = -1;
    do {
        si = contractInfo[i].toString();
        ofs = si.indexOf(Str_RefundFee);
        i += 1;
    } while ((ofs == -1) && (i < contractInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_RefundFee + '` not found');
    }
    ofsEnd = si.indexOf(Str_Btc);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Btc + '` not found');
    }
    refundFeeVal = si.substring(Str_RefundFee.length, ofsEnd).trim();
    // Contract Id
    ofs = -1;
    do {
        si = contractInfo[i].toString();
        ofs = si.indexOf(Str_Contract);
        i += 1;
    } while ((ofs == -1) && (i < contractInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_Contract + '` not found');
    }
    ofsEnd = si.indexOf(Str_Parenthesis);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Parenthesis + '` not found');
    }
    contractIdVal = si.substring(Str_Contract.length, ofsEnd).trim();
    // Contract Data
    if (i >= contractInfo.length) {
        throw new Error('contract value not found');
    }
    contractDataVal = contractInfo[i].toString();
    i += 1;

    // Contract transaction Id
    ofs = -1;
    do {
        si = contractInfo[i].toString();
        ofs = si.indexOf(Str_ContractTransaction);
        i += 1;
    } while ((ofs == -1) && (i < contractInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_ContractTransaction + '` not found');
    }
    ofsEnd = si.indexOf(Str_Parenthesis);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Parenthesis + '` not found');
    }
    contractTxIdVal = si.substring(Str_ContractTransaction.length, ofsEnd).trim();
    // Contract transaction Data
    if (i >= contractInfo.length) {
        throw new Error('contract transaction value not found');
    }
    contractTxDataVal = contractInfo[i].toString();
    i += 1;

    // Refund transaction Id
    ofs = -1;
    do {
        si = contractInfo[i].toString();
        ofs = si.indexOf(Str_RefundTransaction);
        i += 1;
    } while ((ofs == -1) && (i < contractInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_RefundTransaction + '` not found');
    }
    ofsEnd = si.indexOf(Str_Parenthesis);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Parenthesis + '` not found');
    }
    refundTxIdVal = si.substring(Str_RefundTransaction.length, ofsEnd).trim();
    // Refund transaction Data
    if (i >= contractInfo.length) {
        throw new Error('refund transaction value not found');
    }
    refundTxDataVal = contractInfo[i].toString();
    

    return {
        secret: secretVal,
        secretHash: secretHashVal,
        contractFee: contractFeeVal,
        refundFee: refundFeeVal,
        contractId: contractIdVal,
        contractData: contractDataVal,
        contractTxId: contractTxIdVal,
        contractTxData: contractTxDataVal,
        refundTxId: refundTxIdVal,
        refundTxData: refundTxDataVal
     };
}

function audit_check(auditRes, amount, recipient, secretHash) {

    //const Str_ContractAddress = 'Contract address:';
    const Str_ContractValue = 'Contract value:';
    const Str_Btc = ' BTC';
    const Str_RecipientAddress = 'Recipient address:';
    //const Str_RefundAddress = 's refund address:';
    
    const Str_SecretHash = 'Secret hash:';
    //const Str_Locktime = 'Locktime:';
    //const Str_LocktimeReached = 'Locktime reached in ';
     
    audit = auditRes.split(os.EOL);
    i = 0;
    si = '';
    // Contract Value
    ofs = -1;
    do {
        si = audit[i].toString();
        ofs = si.indexOf(Str_ContractValue);
        i += 1;
    } while ((ofs == -1) && (i < audit.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_ContractValue + '` not found');
    }
    ofsEnd = si.indexOf(Str_Btc);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Btc + '` not found');
    }
    amountVal = si.substring(Str_ContractValue.length, ofsEnd).trim();
    if (Math.round(parseFloat(amountVal)*SATOSHI) != Math.round(amount * SATOSHI)) {
        console.log('invalid contract amount value: ', amountVal);
        return false;
    }

    // Recipient Address
    ofs = -1;
    do {
        si = audit[i].toString();
        ofs = si.indexOf(Str_RecipientAddress);
        i += 1;
    } while ((ofs == -1) && (i < audit.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_RecipientAddress + '` not found');
    }
    recipientVal = si.substr(Str_RecipientAddress.length).trim();
    if (recipientVal != recipient) {
        console.log('invalid contract amount value');
        return false;
    }

    // Secret Hash
    ofs = -1;
    do {
        si = audit[i].toString();
        ofs = si.indexOf(Str_SecretHash);
        i += 1;
    } while ((ofs == -1) && (i < audit.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_SecretHash + '` not found');
    }
    secretHashVal = si.substr(Str_SecretHash.length).trim();
    if (secretHashVal != secretHash) {
        console.log('invalid secret hash value');
        return false;
    }
    return true;
}

function tx_parse(txConst, txRes) {
    //const Str_RedeemFee = 'Redeem fee:';
    const Str_Btc = ' BTC';
    //const Str_RedeemTx = 'Redeem transaction (';
    const Str_Parenthesis = '):';
    
    txInfo = txRes.split(os.EOL);
    i = 0;
    si = '';
    // tx fee
    ofs = -1;
    do {
        si = txInfo[i].toString();
        ofs = si.indexOf(txConst.feeName);
        i += 1;
    } while ((ofs == -1) && (i < txInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + txConst.feeName + '` not found');
    }
    ofsEnd = si.indexOf(Str_Btc);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Btc + '` not found');
    }
    txFeeVal = si.substring(txConst.feeName.length, ofsEnd).trim();
    // transaction
    ofs = -1;
    do {
        si = txInfo[i].toString();
        ofs = si.indexOf(txConst.txName);
        i += 1;
    } while ((ofs == -1) && (i < txInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + txConst.txName + '` not found');
    }
    ofsEnd = si.indexOf(Str_Parenthesis);
    if (ofsEnd == -1) {
        throw new Error('field `' + Str_Parenthesis + '` not found');
    }
    txIdVal = si.substring(txConst.txName.length, ofsEnd).trim();
    if (i >= txInfo.length) {
        throw new Error('transaction value not found');
    }
    txDataVal = txInfo[i].toString();

    return {
        txFee: txFeeVal,
        txId: txIdVal,
        txData: txDataVal
    };
}


function extract_check(extractRes, secret) {

    const Str_Secret = 'Secret:';
         
    extractInfo = extractRes.split(os.EOL);
    i = 0;
    si = '';
    // Contract Value
    ofs = -1;
    do {
        si = extractInfo[i].toString();
        ofs = si.indexOf(Str_Secret);
        i += 1;
    } while ((ofs == -1) && (i < extractInfo.length));
    if (ofs == -1) {
        throw new Error('field `' + Str_Secret + '` not found');
    }
    secretVal = si.substr(Str_Secret.length).trim();
    if (secretVal != secret) {
        console.log('invalid secret value');
        return false;
    }
    return true;
}


function test() {

var addressBtcMiner, addressBtc1, addressBtc2;
var addressDshMiner, addressDsh1, addressDsh2;
var countErrors, totalErrors;

    console.log('0. Initial conditions');
/*    
    sleepForWait = false;
    try {
        console.log('btcd stop');
        child_process.execSync('make stop', {
            cwd: BtcTestboxPath,
            encoding: 'utf8',
        }).toString();
        sleepForWait = true;
    } catch (e) {
        //console.log('stop error: ', e)
    }
    try {
        console.log('dashd stop');
        child_process.exec('make stop', {
            cwd: DshTestboxPath,
            encoding: 'utf8',
        }).toString();
        sleepForWait = true;
    } catch (e) {
        //console.log('stop error: ', e)
    }
    if (sleepForWait) {
        console.log('waiting to stop...');
        sleep.sleep(5);
    }
*/    
    try {
/*        
        console.log('btcd start');
        child_process.execSync('make start', {
            cwd: BtcTestboxPath,
            encoding: 'utf8',
        }).toString();
        console.log('waiting to start...');
        sleep.sleep(5);
        console.log('dashd start');
        child_process.exec('make start', {
            cwd: DshTestboxPath,
            encoding: 'utf8',
        }).toString();
        console.log('waiting to start...');
        sleep.sleep(5);
*/

        // get Btc Miner account info
        addressBtcMiner = child_process.execSync('bitcoin-cli -datadir=M getaccountaddress ""', {
            cwd: BtcTestboxPath,
            encoding: 'utf8',
        }).toString().trim();
        console.log('addressBtcMiner = ', addressBtcMiner);

        let balanceResult = child_process.execSync('bitcoin-cli -datadir=M getbalance', {
            cwd: BtcTestboxPath,
            encoding: 'utf8',
        }).toString();
        if (DEBUG == 1) {
            console.log('balance [Btc Miner]: ', balanceResult.trim());
        }
        let balanceBtcMiner = balanceResult.trim();

        // get Btc [1] account info
        //addressBtc1 = child_process.execSync('bitcoin-cli -datadir=1 getnewaddress', {
        addressBtc1 = child_process.execSync('bitcoin-cli -datadir=1 getaccountaddress ""', {
            cwd: BtcTestboxPath,
            encoding: 'utf8',
        }).toString().trim();
        console.log('addressBtc [1] = ', addressBtc1);
        let balanceBtc1 = balance_get(Btc1);

        // get Btc [2] account info
        //addressBtc2 = child_process.execSync('bitcoin-cli -datadir=2 getnewaddress', {
        addressBtc2 = child_process.execSync('bitcoin-cli -datadir=2 getaccountaddress ""', {
            cwd: BtcTestboxPath,
            encoding: 'utf8',
        }).toString().trim();
        console.log('addressBtc [2] = ', addressBtc2);
        let balanceBtc2 = balance_get(Btc2);

        if (balanceBtcMiner < (MinBalanceBtc1 + MinBalanceBtc2)) {
            // if balance is too small - mine some
            console.log('mining some btc for tests...');
            child_process.execSync('make generate BLOCKS=106', {
                cwd: BtcTestboxPath,
                encoding: 'utf8',
            });            
        }
        if (balanceBtc1 < MinBalanceBtc1) {
            console.log('send '.concat(MinBalanceBtc1.toString(), ' from Btc Miner to Btc[1]'));
            child_process.execSync('make sendfromM ADDRESS=' + addressBtc1 + ' AMOUNT=' + MinBalanceBtc1.toString(), {
                cwd: BtcTestboxPath,
                encoding: 'utf8',
            });      
            balance_wait(Btc1, MinBalanceBtc1);
        }
        // check [2] balance
        if (balanceBtc2 < MinBalanceBtc2) {
            console.log('send '.concat(MinBalanceBtc2.toString(), ' from Btc Miner to Btc[2]'));
            child_process.execSync('make sendfromM ADDRESS=' + addressBtc2 + ' AMOUNT=' + MinBalanceBtc2.toString(), {
                cwd: BtcTestboxPath,
                encoding: 'utf8',
            });            
            balance_wait(Btc2, MinBalanceBtc2);
        }

        // get Dsh Miner account info
        addressDshMiner = child_process.execSync('dash-cli -datadir=M getaccountaddress ""', {
            cwd: DshTestboxPath,
            encoding: 'utf8',
        }).toString().trim();
        console.log('addressDshMiner = ', addressDshMiner);

        let balanceDshResult = child_process.execSync('dash-cli -datadir=M getbalance', {
            cwd: DshTestboxPath,
            encoding: 'utf8',
        }).toString();
        if (DEBUG == 1) {
            console.log('balance [Dsh Miner]: ', balanceDshResult.trim());
        }
        let balanceDshMiner = balanceDshResult.trim();

        // get Dsh [1] account info
        //addressDsh1 = child_process.execSync('dash-cli -datadir=1 getnewaddress', {
        addressDsh1 = child_process.execSync('dash-cli -datadir=1 getaccountaddress ""', {
            cwd: DshTestboxPath,
            encoding: 'utf8',
        }).toString().trim();
        console.log('addressDsh [1] = ', addressDsh1);
        let balanceDsh1 = balance_get(Dsh1);

        // get Dsh [2] account info
        //addressDsh2 = child_process.execSync('dash-cli -datadir=2 getnewaddress', {
        addressDsh2 = child_process.execSync('dash-cli -datadir=2 getaccountaddress ""', {
            cwd: DshTestboxPath,
            encoding: 'utf8',
        }).toString().trim();
        console.log('addressDsh [2] = ', addressDsh2);
        let balanceDsh2 = balance_get(Dsh2);

        if (balanceDshMiner < (MinBalanceDsh1 + MinBalanceDsh2)) {
            // if balance is too small - mine some
            console.log('mining some btc for tests...');
            // TODO: calculate required number of blocks
            child_process.execSync('make generate BLOCKS=206', {
                cwd: DshTestboxPath,
                encoding: 'utf8',
            });            
        }
        if (balanceDsh1 < MinBalanceDsh1) {
            console.log('send ', MinBalanceDsh1, ' from Dsh Miner to Dsh[1]');
            child_process.execSync('make sendfromM ADDRESS='.concat(addressDsh1, ' AMOUNT=', MinBalanceDsh1.toString()), {
                cwd: DshTestboxPath,
                encoding: 'utf8',
            });        
            balance_wait(Dsh1, MinBalanceDsh1);
        }
        // check [2] balance
        if (balanceDsh2 < MinBalanceDsh2) {
            console.log('send ', MinBalanceDsh2, ' from Dsh Miner to Dsh[2]');
            child_process.execSync('make sendfromM ADDRESS='.concat(addressDsh2, ' AMOUNT=', MinBalanceDsh2.toString()), {
                cwd: DshTestboxPath,
                encoding: 'utf8',
            });    
            balance_wait(Dsh2, MinBalanceDsh2);
        }

        countErrors = 0;
        totalErrors = 0;
        // initial conditions done

        console.log('');
        console.log('1. BTC->DSH correct swap');
        let iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }

            console.log('1.1. [1] BTC Initiate');
            let initiateCmd = cmd(Btc1).concat(' initiate ', addressBtc2, ' ', SwapAmountBtc.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            //countBtc += 
            tx_wait(Btc1, initiateParams.contractTxId);

            console.log('1.2. [2] BTC AuditContract');
            let audit1Cmd = cmd(Btc2).concat(' auditcontract ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('audit1Cmd: ', audit1Cmd);
            }
            let audit1Result = child_process.execSync(audit1Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('audit1Result: ', audit1Result);
            }
            let res = audit_check(audit1Result, SwapAmountBtc, addressBtc2, initiateParams.secretHash);

            console.log('     [2] DSH Participate');
            let participateCmd = cmd(Dsh2).concat(' participate ', addressDsh1, ' ', SwapAmountDsh.toString(), ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('participateCmd: ', participateCmd);
            }
            let participateResult = child_process.execSync(participateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('participateResult: ', participateResult);
            }
            let participateParams = contract_parse(participateResult, false);
            tx_wait(Dsh2, participateParams.contractTxId);

            console.log('1.3. [1] DSH AuditContract');
            let audit2Cmd = cmd(Dsh1).concat(' auditcontract ', participateParams.contractData, ' ', participateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('audit2Cmd: ', audit2Cmd);
            }
            let audit2Result = child_process.execSync(audit2Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('audit2Result: ', audit2Result);
            }
            res = res && audit_check(audit2Result, SwapAmountDsh, addressDsh1, initiateParams.secretHash);

            console.log('     [1] DSH Redeem');
            let redeem1Cmd = cmd(Dsh1).concat(' redeem ', participateParams.contractData, ' ', participateParams.contractTxData, ' ', initiateParams.secret);
            if (DEBUG == 1) {
                console.log('redeem1Cmd: ', redeem1Cmd);
            }
            let redeem1Result = child_process.execSync(redeem1Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('redeem1Result: ', redeem1Result);
            }
            let redeem1Params = tx_parse(RedeemConsts, redeem1Result);
            tx_wait(Dsh1, redeem1Params.txId);

            console.log('1.4. [2] DSH ExtractSecret');
            let extractCmd = cmd(Dsh2).concat(' extractsecret ', redeem1Params.txData, ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('extractCmd: ', extractCmd);
            }
            let extractResult = child_process.execSync(extractCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('extractResult: ', extractResult);
            }
            res = res && extract_check(extractResult, initiateParams.secret);

            console.log('1.5. [2] BTC Redeem');
            let redeem2Cmd = cmd(Btc2).concat(' redeem ', initiateParams.contractData, ' ', initiateParams.contractTxData, ' ', initiateParams.secret);
            if (DEBUG == 1) {
                console.log('redeem2Cmd: ', redeem2Cmd);
            }
            let redeem2Result = child_process.execSync(redeem2Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('redeem2Result: ', redeem2Result);
            }
            let redeem2Params = tx_parse(RedeemConsts, redeem2Result);
            tx_wait(Btc2, redeem2Params.txId);
            
            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(startBalanceBtc1 * SATOSHI) 
                    - Math.round(SwapAmountBtc * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceBtc2 = (Math.round(startBalanceBtc2 * SATOSHI) 
                    + Math.round(SwapAmountBtc * SATOSHI)
                    - Math.round(parseFloat(redeem2Params.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                countErrors += 1;
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = (Math.round(startBalanceDsh1 * SATOSHI) 
                    + Math.round(SwapAmountDsh * SATOSHI) 
                    - Math.round(parseFloat(redeem1Params.txFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(SwapAmountDsh * SATOSHI)
                    - Math.round(parseFloat(participateParams.contractFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                countErrors += 1;
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }
            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');

        console.log('');
        console.log('2. BTC->DSH refund after initiate');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }
        
            console.log('2.1. [1] BTC Initiate');
            let initiateCmd = cmd(Btc1).concat(' initiate ', addressBtc2, ' ', SwapAmountBtc.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            tx_wait(Btc1, initiateParams.contractTxId);
    
            console.log('2.2. [1] BTC Refund');
            // approximation of 48 hours generation
            // 48 * 6 = 288 is about 120 * 2 = 240
            timelock_wait(120, BtcTestboxPath, 2);

            let refundCmd = cmd(Btc1).concat(' refund ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refundCmd);
            }
            let refundResult = child_process.execSync(refundCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refundResult);
            }
            let refundParams = tx_parse(RefundConsts, refundResult);
            tx_wait(Btc1, refundParams.txId);

            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(parseFloat(startBalanceBtc1) * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refundParams.txFee) * SATOSHI)
                ) / SATOSHI;
            let expectedBalanceBtc2 = startBalanceBtc2;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = startBalanceDsh1;
            let expectedBalanceDsh2 = startBalanceDsh2;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }

            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');


        console.log('');
        console.log('3. BTC->DSH refunds after participate');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }

            console.log('3.1. [1] BTC Initiate');
            let initiateCmd = cmd(Btc1).concat(' initiate ', addressBtc2, ' ', SwapAmountBtc.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            tx_wait(Btc1, initiateParams.contractTxId);

            console.log('3.2. [2] DSH Participate');
            let participateCmd = cmd(Dsh2).concat(' participate ', addressDsh1, ' ', SwapAmountDsh.toString(), ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('participateCmd: ', participateCmd);
            }
            let participateResult = child_process.execSync(participateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('participateResult: ', participateResult);
            }
            let participateParams = contract_parse(participateResult, false);
            tx_wait(Dsh2, participateParams.contractTxId);

            console.log('3.3. [2] DSH Refund');
            // approximation of 24 hours generation
            // 24 * 24 = 576 is about 60 * 9 = 540
            timelock_wait(60, DshTestboxPath, 9);

            let refund1Cmd = cmd(Dsh2).concat(' refund ', participateParams.contractData, ' ', participateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refund1Cmd);
            }
            let refund1Result = child_process.execSync(refund1Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refund1Result);
            }
            let refund1Params = tx_parse(RefundConsts, refund1Result);
            tx_wait(Dsh2, refund1Params.txId);
            
            console.log('3.4. [1] BTC Refund');
            // approximation of 48 hours generation
            // 48 * 6 = 288 is about 60 * 4 = 240
            timelock_wait(60, BtcTestboxPath, 4);

            let refund2Cmd = cmd(Btc1).concat(' refund ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refund2Cmd);
            }
            let refund2Result = child_process.execSync(refund2Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refund2Result);
            }
            let refund2Params = tx_parse(RefundConsts, refund2Result);
            tx_wait(Btc1, refund2Params.txId);

            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(startBalanceBtc1 * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refund2Params.txFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceBtc2 = startBalanceBtc2;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                countErrors += 1;
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = startBalanceDsh1;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(parseFloat(participateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refund1Params.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                countErrors += 1;
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }
            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');


        console.log('');
        console.log('4. BTC->DSH refund after redeem');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }

            console.log('4.1. [1] BTC Initiate');
            let initiateCmd = cmd(Btc1).concat(' initiate ', addressBtc2, ' ', SwapAmountBtc.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            //countBtc += 
            tx_wait(Btc1, initiateParams.contractTxId);

            console.log('4.2. [2] DSH Participate');
            let participateCmd = cmd(Dsh2).concat(' participate ', addressDsh1, ' ', SwapAmountDsh.toString(), ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('participateCmd: ', participateCmd);
            }
            let participateResult = child_process.execSync(participateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('participateResult: ', participateResult);
            }
            let participateParams = contract_parse(participateResult, false);
            tx_wait(Dsh2, participateParams.contractTxId);

            console.log('4.3. [1] DSH Redeem');
            let redeem1Cmd = cmd(Dsh1).concat(' redeem ', participateParams.contractData, ' ', participateParams.contractTxData, ' ', initiateParams.secret);
            if (DEBUG == 1) {
                console.log('redeem1Cmd: ', redeem1Cmd);
            }
            let redeem1Result = child_process.execSync(redeem1Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('redeem1Result: ', redeem1Result);
            }
            let redeem1Params = tx_parse(RedeemConsts, redeem1Result);
            tx_wait(Dsh1, redeem1Params.txId);

            console.log('4.4. [1] BTC Refund');
            // approximation of 48 hours generation
            // 48 * 6 = 288 is about 120 * 2 = 240
            timelock_wait(120, BtcTestboxPath, 2);

            let refundCmd = cmd(Btc1).concat(' refund ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refundCmd);
            }
            let refundResult = child_process.execSync(refundCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refundResult);
            }
            let refundParams = tx_parse(RefundConsts, refundResult);
            tx_wait(Btc1, refundParams.txId);

            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(startBalanceBtc1 * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refundParams.txFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceBtc2 = startBalanceBtc2;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                countErrors += 1;
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = (Math.round(startBalanceDsh1 * SATOSHI) 
                    + Math.round(SwapAmountDsh * SATOSHI) 
                    - Math.round(parseFloat(redeem1Params.txFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(SwapAmountDsh * SATOSHI)
                    - Math.round(parseFloat(participateParams.contractFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                countErrors += 1;
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }
            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');
        

        console.log('');
        console.log('5. DSH->BTC correct transaction');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }

            console.log('5.1. [2] DSH Initiate');
            let initiateCmd = cmd(Dsh2).concat(' initiate ', addressDsh1, ' ', SwapAmountDsh.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            tx_wait(Dsh2, initiateParams.contractTxId);

            console.log('5.2. [1] DSH AuditContract');
            let audit1Cmd = cmd(Dsh1).concat(' auditcontract ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('audit1Cmd: ', audit1Cmd);
            }
            let audit1Result = child_process.execSync(audit1Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('audit1Result: ', audit1Result);
            }
            let res = audit_check(audit1Result, SwapAmountDsh, addressDsh1, initiateParams.secretHash);

            console.log('     [1] BTC Participate');
            let participateCmd = cmd(Btc1).concat(' participate ', addressBtc2, ' ', SwapAmountBtc.toString(), ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('participateCmd: ', participateCmd);
            }
            let participateResult = child_process.execSync(participateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('participateResult: ', participateResult);
            }
            let participateParams = contract_parse(participateResult, false);
            tx_wait(Btc1, participateParams.contractTxId);

            console.log('5.3. [2] BTC AuditContract');
            let audit2Cmd = cmd(Btc2).concat(' auditcontract ', participateParams.contractData, ' ', participateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('audit2Cmd: ', audit2Cmd);
            }
            let audit2Result = child_process.execSync(audit2Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('audit2Result: ', audit2Result);
            }
            res = res && audit_check(audit2Result, SwapAmountBtc, addressBtc2, initiateParams.secretHash);

            console.log('     [2] BTC Redeem');
            let redeem1Cmd = cmd(Btc2).concat(' redeem ', participateParams.contractData, ' ', participateParams.contractTxData, ' ', initiateParams.secret);
            if (DEBUG == 1) {
                console.log('redeem1Cmd: ', redeem1Cmd);
            }
            let redeem1Result = child_process.execSync(redeem1Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('redeem1Result: ', redeem1Result);
            }
            let redeem1Params = tx_parse(RedeemConsts, redeem1Result);
            tx_wait(Btc2, redeem1Params.txId);

            console.log('5.4. [1] BTC ExtractSecret');
            let extractCmd = cmd(Btc1).concat(' extractsecret ', redeem1Params.txData, ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('extractCmd: ', extractCmd);
            }
            let extractResult = child_process.execSync(extractCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('extractResult: ', extractResult);
            }
            res = res && extract_check(extractResult, initiateParams.secret);

            console.log('5.5. [1] DSH Redeem');
            let redeem2Cmd = cmd(Dsh1).concat(' redeem ', initiateParams.contractData, ' ', initiateParams.contractTxData, ' ', initiateParams.secret);
            if (DEBUG == 1) {
                console.log('redeem2Cmd: ', redeem2Cmd);
            }
            let redeem2Result = child_process.execSync(redeem2Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('redeem2Result: ', redeem2Result);
            }
            let redeem2Params = tx_parse(RedeemConsts, redeem2Result);
            tx_wait(Dsh1, redeem2Params.txId);
            
            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(startBalanceBtc1 * SATOSHI) 
                    - Math.round(SwapAmountBtc * SATOSHI) 
                    - Math.round(parseFloat(participateParams.contractFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceBtc2 = (Math.round(startBalanceBtc2 * SATOSHI) 
                    + Math.round(SwapAmountBtc * SATOSHI)
                    - Math.round(parseFloat(redeem1Params.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                countErrors += 1;
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = (Math.round(startBalanceDsh1 * SATOSHI) 
                    + Math.round(SwapAmountDsh * SATOSHI) 
                    - Math.round(parseFloat(redeem2Params.txFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(SwapAmountDsh * SATOSHI)
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                countErrors += 1;
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }
            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');
        

        console.log('');
        console.log('6. DSH->BTC refund after initiate');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }
        
            console.log('6.1. [2] DSH Initiate');
            let initiateCmd = cmd(Dsh2).concat(' initiate ', addressDsh1, ' ', SwapAmountDsh.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            tx_wait(Dsh2, initiateParams.contractTxId);
    
            console.log('6.2. [2] DSH Refund');
            // approximation of 48 hours generation
            // 48 * 24 = 1152 is about 120 * 9 = 1080
            timelock_wait(120, DshTestboxPath, 9);

            let refundCmd = cmd(Dsh2).concat(' refund ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refundCmd);
            }
            let refundResult = child_process.execSync(refundCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refundResult);
            }
            let refundParams = tx_parse(RefundConsts, refundResult);
            tx_wait(Dsh2, refundParams.txId);

            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = startBalanceBtc1;
            let expectedBalanceBtc2 = startBalanceBtc2;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = startBalanceDsh1;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refundParams.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }

            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');
        

        console.log('');
        console.log('7. DSH->BTC refund after participate');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }

            console.log('7.1. [2] DSH Initiate');
            let initiateCmd = cmd(Dsh2).concat(' initiate ', addressDsh1, ' ', SwapAmountDsh.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            tx_wait(Dsh2, initiateParams.contractTxId);

            console.log('7.2. [1] BTC Participate');
            let participateCmd = cmd(Btc1).concat(' participate ', addressBtc2, ' ', SwapAmountBtc.toString(), ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('participateCmd: ', participateCmd);
            }
            let participateResult = child_process.execSync(participateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('participateResult: ', participateResult);
            }
            let participateParams = contract_parse(participateResult, false);
            tx_wait(Btc1, participateParams.contractTxId);

            console.log('7.3. [1] BTC Refund');
            // approximation of 24 hours generation
            // 24 * 6 = 144 is about 60 * 2 = 120
            timelock_wait(60, BtcTestboxPath, 2);

            let refund1Cmd = cmd(Btc1).concat(' refund ', participateParams.contractData, ' ', participateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refund1Cmd);
            }
            let refund1Result = child_process.execSync(refund1Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refund1Result);
            }
            let refund1Params = tx_parse(RefundConsts, refund1Result);
            tx_wait(Btc1, refund1Params.txId);
            
            console.log('7.4. [2] DSH Refund');
            // approximation of 48 hours generation
            // 48 * 24 = 1152 is about 60 * 19 = 1140
            timelock_wait(60, DshTestboxPath, 19);

            let refund2Cmd = cmd(Dsh2).concat(' refund ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refund2Cmd);
            }
            let refund2Result = child_process.execSync(refund2Cmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refund2Result);
            }
            let refund2Params = tx_parse(RefundConsts, refund2Result);
            tx_wait(Dsh2, refund2Params.txId);

            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(startBalanceBtc1 * SATOSHI) 
                    - Math.round(parseFloat(participateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refund1Params.txFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceBtc2 = startBalanceBtc2;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                countErrors += 1;
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = startBalanceDsh1;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refund2Params.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                countErrors += 1;
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }
            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');
       

        console.log('');
        console.log('8. DSH->BTC refund after redeem');
        countErrors = 0;
        iteration = 1;
        do {
            console.log('****************************************');
            console.log('iteration #', iteration);

            let startBalanceBtc1 = balance_get(Btc1);
            let startBalanceBtc2 = balance_get(Btc2);
            let startBalanceDsh1 = balance_get(Dsh1);
            let startBalanceDsh2 = balance_get(Dsh2);
            if (DEBUG == 1) {
                console.log('BTC balances: ', startBalanceBtc1.toString(), ',', startBalanceBtc2.toString());
                console.log('DSH balances: ', startBalanceDsh1.toString(), ',', startBalanceDsh2.toString());
            }

            console.log('8.1. [2] DSH Initiate');
            let initiateCmd = cmd(Dsh2).concat(' initiate ', addressDsh1, ' ', SwapAmountDsh.toString());
            if (DEBUG == 1) {
                console.log('initiateCmd: ', initiateCmd);
            }
            let initiateResult = child_process.execSync(initiateCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('initiateResult: ', initiateResult);
            }
            let initiateParams = contract_parse(initiateResult, true);
            tx_wait(Dsh2, initiateParams.contractTxId);

            console.log('8.2. [1] BTC Participate');
            let participateCmd = cmd(Btc1).concat(' participate ', addressBtc2, ' ', SwapAmountBtc.toString(), ' ', initiateParams.secretHash);
            if (DEBUG == 1) {
                console.log('participateCmd: ', participateCmd);
            }
            let participateResult = child_process.execSync(participateCmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('participateResult: ', participateResult);
            }
            let participateParams = contract_parse(participateResult, false);
            tx_wait(Btc1, participateParams.contractTxId);

            console.log('8.3. [2] BTC Redeem');
            let redeem1Cmd = cmd(Btc2).concat(' redeem ', participateParams.contractData, ' ', participateParams.contractTxData, ' ', initiateParams.secret);
            if (DEBUG == 1) {
                console.log('redeem1Cmd: ', redeem1Cmd);
            }
            let redeem1Result = child_process.execSync(redeem1Cmd, {
                cwd: GoBtcLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('redeem1Result: ', redeem1Result);
            }
            let redeem1Params = tx_parse(RedeemConsts, redeem1Result);
            tx_wait(Btc2, redeem1Params.txId);

            console.log('8.4. [2] DSH Refund');
            // approximation of 48 hours generation
            // 48 * 24 = 1152 is about 120 * 9 = 1080
            timelock_wait(120, DshTestboxPath, 9);

            let refundCmd = cmd(Dsh2).concat(' refund ', initiateParams.contractData, ' ', initiateParams.contractTxData);
            if (DEBUG == 1) {
                console.log('refundCmd: ', refundCmd);
            }
            let refundResult = child_process.execSync(refundCmd, {
                cwd: GoDshLibPath,
                encoding: 'utf8'
            });
            if (DEBUG == 1) {
                console.log('refundResult: ', refundResult);
            }
            let refundParams = tx_parse(RefundConsts, refundResult);
            tx_wait(Dsh2, refundParams.txId);

            let endBalanceBtc1 = balance_get(Btc1);
            let endBalanceBtc2 = balance_get(Btc2);
            let endBalanceDsh1 = balance_get(Dsh1);
            let endBalanceDsh2 = balance_get(Dsh2);

            let expectedBalanceBtc1 = (Math.round(startBalanceBtc1 * SATOSHI) 
                    - Math.round(SwapAmountBtc * SATOSHI) 
                    - Math.round(parseFloat(participateParams.contractFee) * SATOSHI)) / SATOSHI;
            let expectedBalanceBtc2 = (Math.round(startBalanceBtc2 * SATOSHI) 
                    + Math.round(SwapAmountBtc * SATOSHI)
                    - Math.round(parseFloat(redeem1Params.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceBtc1 == expectedBalanceBtc1) && (endBalanceBtc2 == expectedBalanceBtc2)) {
                console.log('BTC balances - OK:', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
            } else {
                countErrors += 1;
                console.log('BTC balances - GOT     : ', endBalanceBtc1.toString(), ',', endBalanceBtc2.toString());
                console.log('BTC balances - EXPECTED: ', expectedBalanceBtc1.toString(), ',', expectedBalanceBtc2.toString());
            }
            let expectedBalanceDsh1 = startBalanceDsh1;
            let expectedBalanceDsh2 = (Math.round(startBalanceDsh2 * SATOSHI) 
                    - Math.round(parseFloat(initiateParams.contractFee) * SATOSHI)
                    - Math.round(parseFloat(refundParams.txFee) * SATOSHI)) / SATOSHI;
            if ((endBalanceDsh1 == expectedBalanceDsh1) && (endBalanceDsh2 == expectedBalanceDsh2)) {
                console.log('DSH balances - OK', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
            } else {
                countErrors += 1;
                console.log('DSH balances - GOT     : ', endBalanceDsh1.toString(), ',', endBalanceDsh2.toString());
                console.log('DSH balances - EXPECTED: ', expectedBalanceDsh1.toString(), ',', expectedBalanceDsh2.toString());
            }
            iteration += 1;
        } while (iteration < LOOPS);
        totalErrors += countErrors;
        console.log(countErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations');

        console.log('Total: ' + totalErrors.toString() + ' errors out of ' + LOOPS.toString() + ' iterations by ' + TestCasesNumber.toString() + ' test cases');


    } catch (e) {
        console.error('Cannot use testbox node:' + e);
        process.exit(1);
    }
}

test();
