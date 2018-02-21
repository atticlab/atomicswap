# Node.js runtime tests for atomic swap

### btc-dsh.js: BTC<=>DSH swap test

## Prerequisites
1. Bitcoin Core daemon (*bitcoind*) shall be installed according to
  https://bitcoin.org/en/full-node#what-is-a-full-node
  Ubuntu:
     sudo apt-add-repository ppa:bitcoin/bitcoin
     sudo apt-get install bitcoind
2. Dash Core daemon (*dashd*) shall be installed according to
  https://www.dash.org/get-dash/  (not tested)
  or https://github.com/dashpay/dash.git (manual installation tested)
4. Bitcoin *testnet-box* shall be loaded from
  https://github.com/xbis/bitcoin-testnet-box
5. Dash *testnet-box* shall be loaded from
  https://github.com/xbis/dash-testnet-box
6. File dash.conf in the local /dash-testnet-box/1 shal be updated:
      port=19020
      rpcport=19021
7. File dash.conf in the local /dash-testnet-box/2:
      connect=127.0.0.1:19020
      port=19030
      rpcport=19031
8. Node.js v.8.9.4+
9. Package system-sleep:
      npm install system-sleep

## Test plan
Designations: [A] - Alice, [B] - Bob

### 1. BTC->DSH correct swap
* [A] BTC Initiate
* [B] BTC AuditContract + DSH Participate
* [A] DSH AuditContract + DSH Redeem
* [B] DSH ExtractSecret
* [B] BTC Redeem

### 2. BTC->DSH refund after initiate
* [A] BTC Initiate
* [A] BTC Refund

### 3. BTC->DSH refunds after participate
* [A] BTC Initiate
* [B] BTC AuditContract + DSH Participate
* [B] DSH Refund
* [A] BTC Refund

### 4. BTC->DSH refund after redeem
* [A] BTC Initiate
* [B] BTC AuditContract + DSH Participate
* [A] DSH AuditContract + DSH Redeem
* [A] BTC Refund
  
### 5. DSH->BTC correct transaction
* [B] DSH Initiate
* [A] DSH AuditContract + BTC Participate
* [B] BTC AuditContract + BTC Redeem
* [A] BTC ExtractSecret
* [A] DSH Redeem

### 6. DSH->BTC refund after initiate
* [B] DSH Initiate
* [B] DSH Refund
  
### 7. DSH->BTC refund after participate
* [B] DSH Initiate
* [A] DSH AuditContract + BTC Participate
* [A] BTC Refund
* [B] DSH Refund

### 8. DSH->BTC refund after redeem
* [B] DSH Initiate
* [A] DSH AuditContract + BTC Participate
* [B] BTC AuditContract + BTC Redeem
* [A] BTC ExtractSecret
* [A] DSH Refund


