This project is presented as the project demo of group 8 for EE4032 Blockchain Engineering of NUS.

## End-to-End Pipeline

1. **Compile & Deploy the Auction contract**
   - Open `src/contracts/Auction.sol` in Remix (or your preferred Solidity IDE).
   - Compile the contract with the same Solidity version (0.8.18).
   - Deploy it, providing the constructor parameters in this order:  
     `k`, `commitDuration`, `revealDuration`, `_reservePrice`, `_minDeposit`, `_finalizeGrace`, `_finalizeReward`, `_whitelistRoot`, `_whitelistOn`.
   - Record the deployed contract address.
   - Copy the generated ABI JSON.

2. **Configure the front end**
   - Update `src/contracts/config_auction.js` with the new contract address and ABI.

3. **Install dependencies & start the UI**
   - Run `npm install` (first time only).
   - Run `npm start` to launch the React app.

4. **Use the auction**
   - The deployer account (the one used in Remix) acts as the seller.
   - Any other wallet can connect as a buyer, commit bids, reveal, and (after the grace window) finalize if the seller delays.

That’s it—once the config has the correct address/ABI and the app is running, the system is ready for testing on your chosen network.

