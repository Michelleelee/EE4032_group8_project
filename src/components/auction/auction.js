// src/components/auction/auction.js
import React, { useEffect, useState } from "react";
import "./auction.css";

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
    price: "",
    salt: "",
    proof: ""
  });
  const [revealForm, setRevealForm] = useState({
    qty: "",
    price: "",
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
        price: "",
        salt: "",
        proof: ""
      });
    }
  }, [props.commitDone]);

  useEffect(() => {
    if (props.revealDone) {
      setRevealForm({
        qty: "",
        price: "",
        salt: "",
        rand: ""
      });
    }
  }, [props.revealDone]);

  if (!props.isConnected) {
    return <div>Please connect MetaMask first.</div>;
  }

  return (
    <div className="auction-wrap">
      <h2>Sealed-Bid k‑Unit Auction (Uniform Price)</h2>
      <p>{roleText}</p>
      <p>{phaseText}</p>

      {showCommitBlock && (
        <section className="panel">
          <h3>Commit Phase</h3>
          <p>I submit a sealed commitment hash of (qty, price, salt, my address). I also send the fixed deposit.</p>
          <p>Commit phase ends in: {commitCountdown}</p>
          <div className="row">
            <input
              id="AuctionCommitQty"
              type="number"
              placeholder="quantity (e.g., 2)"
              value={commitForm.qty}
              onChange={(e) => setCommitForm(form => ({ ...form, qty: e.target.value }))}
            />
            <input
              id="AuctionCommitPrice"
              type="number"
              placeholder="price (wei, e.g., 1000000000000000)"
              value={commitForm.price}
              onChange={(e) => setCommitForm(form => ({ ...form, price: e.target.value }))}
            />
            <input
              id="AuctionCommitSalt"
              type="text"
              placeholder="salt (random text or hex)"
              value={commitForm.salt}
              onChange={(e) => setCommitForm(form => ({ ...form, salt: e.target.value }))}
            />
          </div>
          <div className="row">
            <input
              id="AuctionCommitProof"
              type="text"
              placeholder="whitelist proof (comma-separated 0x..., leave empty if off)"
              value={commitForm.proof}
              onChange={(e) => setCommitForm(form => ({ ...form, proof: e.target.value }))}
            />
          </div>
          <button onClick={() => props.onCommit(commitForm)}>Commit Bid</button>
          {props.commitPending && <p>Committing...</p>}
          {props.commitDone && <p>Committed. I will reveal later.</p>}
          {props.commitError && <p className="error-text">Commit failed: {props.commitError}</p>}
        </section>
      )}

      {showRevealBlock && (
        <section className="panel">
          <h3>Reveal Phase</h3>
          <p>I must reveal exactly the same (qty, price, salt) and pay price*qty as escrow. I also add `randPart` as extra randomness.</p>
          <p>Reveal phase ends in: {revealCountdown}</p>
          <div className="row">
            <input
              id="AuctionRevealQty"
              type="number"
              placeholder="quantity"
              value={revealForm.qty}
              onChange={(e) => setRevealForm(form => ({ ...form, qty: e.target.value }))}
            />
            <input
              id="AuctionRevealPrice"
              type="number"
              placeholder="price (wei)"
              value={revealForm.price}
              onChange={(e) => setRevealForm(form => ({ ...form, price: e.target.value }))}
            />
            <input
              id="AuctionRevealSalt"
              type="text"
              placeholder="salt (same as commit)"
              value={revealForm.salt}
              onChange={(e) => setRevealForm(form => ({ ...form, salt: e.target.value }))}
            />
            <input
              id="AuctionRevealRand"
              type="text"
              placeholder="randPart (any random text or hex)"
              value={revealForm.rand}
              onChange={(e) => setRevealForm(form => ({ ...form, rand: e.target.value }))}
            />
          </div>
          <button onClick={() => props.onReveal(revealForm)}>Reveal Bid</button>
          {props.revealPending && <p>Revealing...</p>}
          {props.revealDone && <p>Revealed. I am waiting for finalize.</p>}
          {props.revealError && <p className="error-text">Reveal failed: {props.revealError}</p>}
        </section>
      )}

      {showSellerFinalizeBlock && (
        <section className="panel">
          <h3>Finalize Controls</h3>
          <p>You can finalize now to settle all payments.</p>
          {finalizeSecondsLeft > 0 ? (
            <p>Buyer grace period remaining: {finalizeCountdown}.</p>
          ) : (
            <p>Grace period has expired. Buyers may also finalize.</p>
          )}
          <button onClick={props.onFinalize}>Finalize Auction</button>
        </section>
      )}

      {showBuyerFinalizeInfo && (
        <section className="panel">
          <h3>Finalize Controls</h3>
          {finalizeSecondsLeft > 0 ? (
            <>
              <p>Please wait for the seller to finalize.</p>
              <p>In {finalizeCountdown}, any committed buyer may finalize and earn up to {props.finalizeReward} wei as an incentive.</p>
            </>
          ) : (
            <>
              <p>Grace period expired. You can finalize now and earn up to {props.finalizeReward} wei for unlocking the payout.</p>
              <button onClick={props.onFinalize}>Finalize Auction</button>
            </>
          )}
        </section>
      )}

      {showSettledInfo && (
        <section className="panel">
          <h3>Settlement</h3>
          <p>This auction has been finalized.</p>
        </section>
      )}

      <section className="panel">
        <h3>Status</h3>
        <p>k units: {props.kUnits}</p>
        <p>reserve price: {props.reservePrice}</p>
        <p>min deposit (wei): {props.minDeposit}</p>
        <p>commit deadline (unix): {props.commitDeadline}</p>
        <p>reveal deadline (unix): {props.revealDeadline}</p>
        <p>finalize grace (s): {props.finalizeGrace}</p>
        <p>finalize reward (wei): {props.finalizeReward}</p>
        <p>buyer finalize unlock (unix): {props.finalizeDeadline}</p>
        <p>whitelist on: {String(props.whitelistOn)}</p>
        <p>settled: {String(props.settled)}</p>
        {props.settled && <p><b>Uniform Clearing Price:</b> {props.clearingPrice} wei per unit</p>}
      </section>
    </div>
  );
}
