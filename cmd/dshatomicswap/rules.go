// Copyright (c) 2016 The btcsuite developers
// Use of this source code is governed by an ISC
// license that can be found in the LICENSE file.

// Package txrules provides transaction rules that should be followed by
// transaction authors for wide mempool acceptance and quick mining.
package main

import (
	"errors"

	"github.com/xbis/godash/txscript"
	"github.com/xbis/godash/wire"
	"github.com/xbis/godashutil"
)

// DefaultRelayFeePerKb is the default minimum relay fee policy for a mempool.
const DefaultRelayFeePerKb godashutil.Amount = 1e3

// IsDustAmount determines whether a transaction output value and script length would
// cause the output to be considered dust.  Transactions with dust outputs are
// not standard and are rejected by mempools with default policies.
func IsDustAmount(amount godashutil.Amount, scriptSize int, relayFeePerKb godashutil.Amount) bool {
	// Calculate the total (estimated) cost to the network.  This is
	// calculated using the serialize size of the output plus the serial
	// size of a transaction input which redeems it.  The output is assumed
	// to be compressed P2PKH as this is the most common script type.  Use
	// the average size of a compressed P2PKH redeem input (148) rather than
	// the largest possible (txsizes.RedeemP2PKHInputSize).
	totalSize := 8 + wire.VarIntSerializeSize(uint64(scriptSize)) +
		scriptSize + 148

	// Dust is defined as an output value where the total cost to the network
	// (output size + input size) is greater than 1/3 of the relay fee.
	return int64(amount)*1000/(3*int64(totalSize)) < int64(relayFeePerKb)
}

// IsDustOutput determines whether a transaction output is considered dust.
// Transactions with dust outputs are not standard and are rejected by mempools
// with default policies.
func IsDustOutput(output *wire.TxOut, relayFeePerKb godashutil.Amount) bool {
	// Unspendable outputs which solely carry data are not checked for dust.
	if txscript.GetScriptClass(output.PkScript) == txscript.NullDataTy {
		return false
	}

	// All other unspendable outputs are considered dust.
	if txscript.IsUnspendable(output.PkScript) {
		return true
	}

	return IsDustAmount(godashutil.Amount(output.Value), len(output.PkScript),
		relayFeePerKb)
}

// Transaction rule violations
var (
	ErrAmountNegative   = errors.New("transaction output amount is negative")
	ErrAmountExceedsMax = errors.New("transaction output amount exceeds maximum value")
	ErrOutputIsDust     = errors.New("transaction output is dust")
)

// CheckOutput performs simple consensus and policy tests on a transaction
// output.
func CheckOutput(output *wire.TxOut, relayFeePerKb godashutil.Amount) error {
	if output.Value < 0 {
		return ErrAmountNegative
	}
	if output.Value > godashutil.MaxSatoshi {
		return ErrAmountExceedsMax
	}
	if IsDustOutput(output, relayFeePerKb) {
		return ErrOutputIsDust
	}
	return nil
}

// FeeForSerializeSize calculates the required fee for a transaction of some
// arbitrary size given a mempool's relay fee policy.
func FeeForSerializeSize(relayFeePerKb godashutil.Amount, txSerializeSize int) godashutil.Amount {
	fee := relayFeePerKb * godashutil.Amount(txSerializeSize) / 1000

	if fee == 0 && relayFeePerKb > 0 {
		fee = relayFeePerKb
	}

	if fee < 0 || fee > godashutil.MaxSatoshi {
		fee = godashutil.MaxSatoshi
	}

	return fee
}
