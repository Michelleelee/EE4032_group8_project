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

  useEffect(() => {
    const formatCountdown = (seconds) => {
      if (seconds <= 0) {
        return "ended";
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
      setCommitCountdown(formatCountdown(commitDiff));
      setRevealCountdown(formatCountdown(revealDiff));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [props.commitDeadline, props.revealDeadline]);

  if (!props.isConnected) {
    return <div>Please connect MetaMask first.</div>;
  }

  return (
    <div className="auction-wrap">
      <h2>Sealed-Bid k‑Unit Auction (Uniform Price)</h2>

      <section className="panel">
        <h3>Commit Phase</h3>
        <p>I submit a sealed commitment hash of (qty, price, salt, my address). I also send the fixed deposit.</p>
        <p>Commit phase ends in: {commitCountdown}</p>
        <div className="row">
          <input id="AuctionCommitQty" type="number" placeholder="quantity (e.g., 2)" />
          <input id="AuctionCommitPrice" type="number" placeholder="price (wei, e.g., 1000000000000000)" />
          <input id="AuctionCommitSalt" type="text" placeholder="salt (random text or hex)" />
        </div>
        <div className="row">
          <input id="AuctionCommitProof" type="text" placeholder="whitelist proof (comma-separated 0x..., leave empty if off)" />
        </div>
        <button onClick={props.onCommit}>Commit Bid</button>
        {props.commitPending && <p>Committing...</p>}
        {props.commitDone && <p>Committed. I will reveal later.</p>}
      </section>

      <section className="panel">
        <h3>Reveal Phase</h3>
        <p>I must reveal exactly the same (qty, price, salt) and pay price*qty as escrow. I also add `randPart` as extra randomness.</p>
        <p>Reveal phase ends in: {revealCountdown}</p>
        <div className="row">
          <input id="AuctionRevealQty" type="number" placeholder="quantity" />
          <input id="AuctionRevealPrice" type="number" placeholder="price (wei)" />
          <input id="AuctionRevealSalt" type="text" placeholder="salt (same as commit)" />
          <input id="AuctionRevealRand" type="text" placeholder="randPart (any random text or hex)" />
        </div>
        <button onClick={props.onReveal}>Reveal Bid</button>
        {props.revealPending && <p>Revealing...</p>}
        {props.revealDone && <p>Revealed. I am waiting for finalize.</p>}
      </section>

      <section className="panel">
        <h3>Seller Controls</h3>
        <p>I only use this with the seller account (the deployer).</p>
        <button onClick={props.onFinalize}>Finalize Auction</button>
      </section>

      <section className="panel">
        <h3>Status</h3>
        <p>k units: {props.kUnits}</p>
        <p>reserve price: {props.reservePrice}</p>
        <p>min deposit (wei): {props.minDeposit}</p>
        <p>commit deadline (unix): {props.commitDeadline}</p>
        <p>reveal deadline (unix): {props.revealDeadline}</p>
        <p>whitelist on: {String(props.whitelistOn)}</p>
        <p>settled: {String(props.settled)}</p>
        {props.settled && <p><b>Uniform Clearing Price:</b> {props.clearingPrice} wei per unit</p>}
      </section>
    </div>
  );
}
