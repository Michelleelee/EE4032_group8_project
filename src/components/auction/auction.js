// src/components/auction/auction.js
import React, { useEffect, useRef, useState } from "react";
import { formatEther, parseEther } from "ethers/lib/utils";
// import "./auction.css"

/*
  I keep this component as a thin view. All blockchain actions are passed from App.js via props.
  - I show commit inputs: quantity, price, salt, and optional whitelist proof
  - I show reveal inputs: quantity, price, salt, and an extra random part to strengthen randomness
  - I expose the seller-only finalize button
  - I display auction status and the clearing price after settlement
*/

export default function Auction(props) {
    const [commitCountdown, setCommitCountdown] = useState("");
    const [revealCountdown, setRevealCountdown] = useState("");
    const [finalizeCountdown, setFinalizeCountdown] = useState("");
    const [finalizeSecondsLeft, setFinalizeSecondsLeft] = useState(0);
    const [commitForm, setCommitForm] = useState({
        qty: "",
        price_raw: "",
        unit: "wei",
        salt: "",
        proof: ""
    });
    const [revealForm, setRevealForm] = useState({
        qty: "",
        price_raw: "",
        unit: "wei",
        salt: "",
        rand: ""
    });

    const userAddr = props.userAddress ? props.userAddress.toLowerCase() : "";
    const sellerAddr = props.sellerAddress ? props.sellerAddress.toLowerCase() : "";
    const isSeller = userAddr && sellerAddr && userAddr === sellerAddr;
    const inCommitPhase = Boolean(props.inCommitPhase);
    const inRevealPhase = Boolean(props.inRevealPhase);
    const isFinalizePhase = !inCommitPhase && !inRevealPhase;
    const isSettled = Boolean(props.settled);
    const hasPhaseData = Boolean(sellerAddr) || inCommitPhase || inRevealPhase || isSettled;

    const roleText = sellerAddr
        ? (isSeller
            ? "You are the seller! Welcome to the auction."
            : "You are the buyer! Welcome to the auction.")
        : "Loading role information...";

    let phaseText = "Loading phase information...";
    if (inCommitPhase) {
        phaseText = "It is the commit phase.";
    } else if (inRevealPhase) {
        phaseText = "It is the reveal phase.";
    } else if (isSettled) {
        phaseText = "It is the finalized phase.";
    } else if (hasPhaseData && isFinalizePhase) {
        phaseText = "It is the finalized phase.";
    }

    const showCommitBlock = inCommitPhase;
    const showRevealBlock = inRevealPhase;
    const showSellerFinalizeBlock = hasPhaseData && isSeller && isFinalizePhase && !isSettled;
    const showBuyerFinalizeInfo = hasPhaseData && !isSeller && isFinalizePhase && !isSettled;
    const showSettledInfo = hasPhaseData && isSettled;

    useEffect(() => {
        const formatCountdown = (seconds) => {
            if (seconds <= 0) {
                return "ended";
                // return "0.0";
            }
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            const parts = [
                h > 0 ? `${h}h` : null,
                m > 0 ? `${m}m` : null,
                `${s}s`,
            ].filter(Boolean);
            return parts.join(" ");
        };

        const tick = () => {
            const now = Math.floor(Date.now() / 1000);
            const commitDiff = Number(props.commitDeadline || 0) - now;
            const revealDiff = Number(props.revealDeadline || 0) - now;
            const finalizeDiff = Number(props.finalizeDeadline || 0) - now;
            setCommitCountdown(formatCountdown(commitDiff));
            setRevealCountdown(formatCountdown(revealDiff));
            setFinalizeCountdown(formatCountdown(finalizeDiff));
            setFinalizeSecondsLeft(finalizeDiff > 0 ? finalizeDiff : 0);
        };

        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [props.commitDeadline, props.revealDeadline, props.finalizeDeadline]);

    useEffect(() => {
        if (props.commitDone) {
            setCommitForm({
                qty: "",
                price_raw: "",
                unit: "wei",
                salt: "",
                proof: ""
            });
        }
    }, [props.commitDone]);

    useEffect(() => {
        if (props.revealDone) {
            setRevealForm({
                qty: "",
                price_raw: "",
                unit: "wei",
                salt: "",
                rand: ""
            });
        }
    }, [props.revealDone]);

    if (!props.isConnected) {
        return <div>Please connect MetaMask first.</div>;
    }

    return (
        <div className="container mt-4" style={{ maxWidth: "880px" }}>
            <h2>Sealed-Bid k-Unit Auction (Uniform Price)</h2>
            <p>{roleText}</p>
            <p>{phaseText}</p>

            {showCommitBlock && (
                <section className="border rounded p-3 mb-2">
                    <h3>Commit Phase</h3>
                    <p>I submit a sealed commitment hash of (qty, price, salt, my address). I also send the fixed deposit.</p>
                    <p>Commit phase ends in: {commitCountdown}</p>
                    <div className="row mb-2">
                        <div className="col-md-6">
                            <input
                                id="AuctionCommitQty"
                                className="form-control"
                                type="number"
                                placeholder="quantity (e.g., 2)"
                                value={commitForm.qty}
                                onChange={(e) => setCommitForm(form => ({ ...form, qty: e.target.value }))}
                            />
                        </div>
                        <div className=" col-md-6">
                            <div className=" input-group">
                                <input
                                    id="AuctionCommitPrice"
                                    className="form-control"
                                    type="number"
                                    placeholder="price"
                                    value={commitForm.price_raw}
                                    onChange={(e) => setCommitForm(form => ({ ...form, price_raw: e.target.value }))}
                                />
                                <select
                                    className="form-select"
                                    name="unit"
                                    value={commitForm.unit}
                                    onChange={(e) => setCommitForm(form => ({ ...form, unit: e.target.value }))}
                                    style={{ flex: "0 0 80px" }}
                                >
                                    <option value="wei">WEI</option>
                                    <option value="eth">ETH</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="row mb-2">
                        <div className="col-md-6">
                            <input
                                id="AuctionCommitSalt"
                                className="form-control"
                                type="text"
                                placeholder="salt (random text or hex)"
                                value={commitForm.salt}
                                onChange={(e) => setCommitForm(form => ({ ...form, salt: e.target.value }))}
                            />
                        </div>
                        <div className="col-md-6">
                            <input
                                id="AuctionCommitProof"
                                className="form-control"
                                type="text"
                                placeholder="whitelist proof (comma-separated 0x..., leave empty if off)"
                                value={commitForm.proof}
                                onChange={(e) => setCommitForm(form => ({ ...form, proof: e.target.value }))}
                            />
                        </div>
                    </div>
                    <button type="button" class="btn btn-primary" onClick={() => props.onCommit(commitForm)}>Commit Bid</button>
                    {props.commitPending && <p>Committing...</p>}
                    {props.commitDone && <p>Committed. I will reveal later.</p>}
                    {props.commitError && <p className="error-text">Commit failed: {props.commitError}</p>}
                </section>
            )}

            {showRevealBlock && (
                <section className="border rounded p-3 mb-2">
                    <h3>Reveal Phase</h3>
                    <p>I must reveal exactly the same (qty, price, salt) and pay price*qty as escrow. I also add `randPart` as extra randomness.</p>
                    <p>Reveal phase ends in: {revealCountdown}</p>
                    <div className="row mb-2">
                        <div className="col-md-6">
                            <input
                                id="AuctionRevealQty"
                                className="form-control"
                                type="number"
                                placeholder="quantity"
                                value={revealForm.qty}
                                onChange={(e) => setRevealForm(form => ({ ...form, qty: e.target.value }))}
                            />
                        </div>

                        <div className="col-md-6">
                            <div className="input-group">
                                <input
                                    id="AuctionRevealPrice"
                                    className="form-control"
                                    type="number"
                                    placeholder="price"
                                    value={revealForm.price_raw}
                                    onChange={(e) => setRevealForm(form => ({ ...form, price_raw: e.target.value }))}

                                />
                                <select
                                    className="form-select"
                                    style={{ flex: "0 0 80px" }}
                                    name="unit"
                                    value={revealForm.unit}
                                    onChange={(e) => setRevealForm(form => ({ ...form, unit: e.target.value }))}
                                >
                                    <option value="wei">WEI</option>
                                    <option value="eth">ETH</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="row mb-2">
                        <div className="col-md-6">
                            <input
                                id="AuctionRevealSalt"
                                className="form-control"
                                type="text"
                                placeholder="salt (same as commit)"
                                value={revealForm.salt}
                                onChange={(e) => setRevealForm(form => ({ ...form, salt: e.target.value }))}
                            />
                        </div>
                        <div className="col-md-6">
                            <input
                                id="AuctionRevealRand"
                                className="form-control"
                                type="text"
                                placeholder="randPart (any random text or hex)"
                                value={revealForm.rand}
                                onChange={(e) => setRevealForm(form => ({ ...form, rand: e.target.value }))}
                            />
                        </div>
                    </div>
                    <button type="button" class="btn btn-primary" onClick={() => props.onReveal(revealForm)}>Reveal Bid</button>
                    {props.revealPending && <p>Revealing...</p>}
                    {props.revealDone && <p>Revealed. I am waiting for finalize.</p>}
                    {props.revealError && <p className="error-text">Reveal failed: {props.revealError}</p>}
                </section>
            )}

            {showSellerFinalizeBlock && (
                <section className="border rounded p-3 mb-2">
                    <h3>Finalize Controls</h3>
                    <p>You can finalize now to settle all payments.</p>
                    {finalizeSecondsLeft > 0 ? (
                        <p>Buyer grace period remaining: {finalizeCountdown}.</p>
                    ) : (
                        <p>Grace period has expired. Buyers may also finalize.</p>
                    )}
                    <button type="button" class="btn btn-primary" onClick={props.onFinalize}>Finalize Auction</button>
                </section>
            )}

            {showBuyerFinalizeInfo && (
                <section className="border rounded p-3 mb-2">
                    <h3>Finalize Controls</h3>
                    {finalizeSecondsLeft > 0 ? (
                        <>
                            <p>Please wait for the seller to finalize.</p>
                            <p>In {finalizeCountdown}, any committed buyer may finalize and earn up to {formatEther(String(props.finalizeReward))} ETH as an incentive.</p>
                        </>
                    ) : (
                        <>
                            <p>Grace period expired. You can finalize now and earn up to {formatEther(String(props.finalizeReward))} ETH for unlocking the payout.</p>
                            <button onClick={props.onFinalize}>Finalize Auction</button>
                        </>
                    )}
                </section>
            )}

            {showSettledInfo && (
                <section className="border rounded p-3 mb-2">
                    <h3>Settlement</h3>
                    <p>This auction has been finalized.</p>
                </section>
            )}

            <section className="border rounded p-3 mb-2">
                <h3>Status</h3>
                <p>k units: {props.kUnits}</p>
                <p>reserve price (ETH): {formatEther(String(props.reservePrice))}</p>
                <p>min deposit (ETH): {formatEther(String(props.minDeposit))}</p>
                <p>finalize reward (ETH): {formatEther(String(props.finalizeReward))}</p>
                <p>commit deadline: {new Date(props.commitDeadline * 1000).toLocaleString()}</p>
                <p>reveal deadline: {new Date(props.revealDeadline * 1000).toLocaleString()}</p>
                <p>finalize deadline: {new Date(props.finalizeDeadline * 1000).toLocaleString()}</p>
                <p>whitelist on: {String(props.whitelistOn)}</p>
                <p>settled: {String(props.settled)}</p>
                {props.settled && <p><b>Uniform Clearing Price:</b> {formatEther(String(props.clearingPrice))} ETH per unit</p>}
            </section>
        </div>
    );
}
