const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const createCommitHash = (qty, price, salt, bidderAddress) => {
    return ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [qty, price, salt, bidderAddress]
    );
};

describe("Auction", function () {
    const K_UNIFORM = 5;
    const COMMIT_DURATION = 60 * 60; // 1 hour
    const REVEAL_DURATION = 60 * 60; // 1 hour
    const RESERVE_PRICE = ethers.parseEther("0.1");
    const MIN_DEPOSIT = ethers.parseEther("0.01");
    const FINALIZE_REWARD = ethers.parseEther("0.005");

    // Fixture: 部署一个没有白名单的拍卖合约
    async function deployAuctionFixture() {
        const [seller, bidder1, bidder2, bidder3, bidder4, nonParticipant] = await ethers.getSigners();

        const AuctionFactory = await ethers.getContractFactory("Auction");
        const auction = await AuctionFactory.connect(seller).deploy(
            K_UNIFORM,
            COMMIT_DURATION,
            REVEAL_DURATION,
            RESERVE_PRICE,
            MIN_DEPOSIT,
            FINALIZE_GRACE,
            FINALIZE_REWARD,
            ethers.ZeroHash, // whitelistRoot
            false // whitelistOn
        );
        await auction.waitForDeployment();

        const commitDeadline = await auction.commitDeadline();
        const revealDeadline = await auction.revealDeadline();
        const finalizeGraceDeadline = await auction.finalizeGraceDeadline();

        return { auction, seller, bidder1, bidder2, bidder3, bidder4, nonParticipant, commitDeadline, revealDeadline, finalizeGraceDeadline };
    }

    // Fixture: 部署一个启用了白名单的拍卖合约
    async function deployWhitelistedAuctionFixture() {
        const [seller, bidder1, bidder2, bidder3, bidder4, nonParticipant] = await ethers.getSigners();
        
        const whitelistedAddresses = [bidder1.address, bidder2.address, bidder3.address, bidder4.address];
        const leaves = whitelistedAddresses.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const root = merkleTree.getHexRoot();

        const AuctionFactory = await ethers.getContractFactory("Auction");
        const auction = await AuctionFactory.connect(seller).deploy(
            K_UNIFORM,
            COMMIT_DURATION,
            REVEAL_DURATION,
            RESERVE_PRICE,
            MIN_DEPOSIT,
            FINALIZE_GRACE,
            FINALIZE_REWARD,
            root,
            true // whitelistOn
        );
        await auction.waitForDeployment();

        const commitDeadline = await auction.commitDeadline();
        const revealDeadline = await auction.revealDeadline();

        return { auction, seller, bidder1, bidder2, bidder3, bidder4, nonParticipant, merkleTree, commitDeadline, revealDeadline };
    }

    describe("Deployment", function () {
        it("Should set the correct initial state variables", async function () {
            const { auction, seller } = await loadFixture(deployAuctionFixture);
            expect(await auction.seller()).to.equal(seller.address);
            expect(await auction.k()).to.equal(K_UNIFORM);
            expect(await auction.reservePrice()).to.equal(RESERVE_PRICE);
            expect(await auction.minDeposit()).to.equal(MIN_DEPOSIT);
            expect(await auction.finalizeGrace()).to.equal(FINALIZE_GRACE);
            expect(await auction.finalizeReward()).to.equal(FINALIZE_REWARD);
            expect(await auction.whitelistOn()).to.be.false;
            expect(await auction.settled()).to.be.false;
        });

        it("Should fail deployment with k=0", async function () {
            const AuctionFactory = await ethers.getContractFactory("Auction");
            await expect(AuctionFactory.deploy(0, 60, 60, 1, 1, 600, 1, ethers.ZeroHash, false))
                .to.be.revertedWith("k=0");
        });

        it("Should fail deployment with zero duration", async function () {
            const AuctionFactory = await ethers.getContractFactory("Auction");
            await expect(AuctionFactory.deploy(1, 0, 60, 1, 1, 600, 1, ethers.ZeroHash, false))
                .to.be.revertedWith("bad durations");
        });

        it("Should fail deployment with zero finalize grace", async function () {
            const AuctionFactory = await ethers.getContractFactory("Auction");
            await expect(AuctionFactory.deploy(1, 60, 60, 1, 1, 0, 1, ethers.ZeroHash, false))
                .to.be.revertedWith("bad finalize grace");
        });
    });

    describe("Commit Phase", function () {
        it("Should allow a bidder to commit a bid", async function () {
            const { auction, bidder1 } = await loadFixture(deployAuctionFixture);
            const salt = ethers.randomBytes(32);
            const commitHash = createCommitHash(1, ethers.parseEther("0.2"), salt, bidder1.address);

            await expect(auction.connect(bidder1).commitBid(commitHash, [], { value: MIN_DEPOSIT }))
                .to.emit(auction, "Committed")
                .withArgs(bidder1.address, commitHash);

            expect(await auction.hasCommit(bidder1.address)).to.be.true;
            expect(await auction.commitOf(bidder1.address)).to.equal(commitHash);
            expect(await auction.depositOf(bidder1.address)).to.equal(MIN_DEPOSIT);
        });

        it("Should reject commit with insufficient deposit", async function () {
            const { auction, bidder1 } = await loadFixture(deployAuctionFixture);
            const commitHash = createCommitHash(1, ethers.parseEther("0.2"), ethers.randomBytes(32), bidder1.address);
            // ethers v6: Use BigInt arithmetic
            const insufficientDeposit = MIN_DEPOSIT - 1n;
            await expect(auction.connect(bidder1).commitBid(commitHash, [], { value: insufficientDeposit }))
                .to.be.revertedWith("deposit too small");
        });

        it("Should reject second commit from the same bidder", async function () {
            const { auction, bidder1 } = await loadFixture(deployAuctionFixture);
            const commitHash = createCommitHash(1, ethers.parseEther("0.2"), ethers.randomBytes(32), bidder1.address);
            await auction.connect(bidder1).commitBid(commitHash, [], { value: MIN_DEPOSIT });

            await expect(auction.connect(bidder1).commitBid(commitHash, [], { value: MIN_DEPOSIT }))
                .to.be.revertedWith("already committed");
        });

        it("Should reject commit after commit deadline", async function () {
            const { auction, bidder1, commitDeadline } = await loadFixture(deployAuctionFixture);
            await time.increaseTo(commitDeadline);
            const commitHash = createCommitHash(1, ethers.parseEther("0.2"), ethers.randomBytes(32), bidder1.address);
            await expect(auction.connect(bidder1).commitBid(commitHash, [], { value: MIN_DEPOSIT }))
                .to.be.revertedWith("commit closed");
        });

        context("With Whitelist", function () {
            it("Should allow a whitelisted bidder to commit", async function () {
                const { auction, bidder1, merkleTree } = await loadFixture(deployWhitelistedAuctionFixture);
                const leaf = keccak256(bidder1.address);
                const proof = merkleTree.getHexProof(leaf);
                const commitHash = createCommitHash(1, ethers.parseEther("0.2"), ethers.randomBytes(32), bidder1.address);

                await expect(auction.connect(bidder1).commitBid(commitHash, proof, { value: MIN_DEPOSIT }))
                    .to.not.be.reverted;
            });

            it("Should reject a non-whitelisted bidder", async function () {
                const { auction, nonParticipant } = await loadFixture(deployWhitelistedAuctionFixture);
                const commitHash = createCommitHash(1, ethers.parseEther("0.2"), ethers.randomBytes(32), nonParticipant.address);

                await expect(auction.connect(nonParticipant).commitBid(commitHash, [], { value: MIN_DEPOSIT }))
                    .to.be.revertedWith("not whitelisted");
            });
        });
    });

    describe("Reveal Phase", function () {
        async function committedFixture() {
            const { auction, bidder1, commitDeadline } = await loadFixture(deployAuctionFixture);
            const salt = ethers.randomBytes(32);
            const price = ethers.parseEther("0.5");
            const qty = 2;
            const commitHash = createCommitHash(qty, price, salt, bidder1.address);
            await auction.connect(bidder1).commitBid(commitHash, [], { value: MIN_DEPOSIT });
            await time.increaseTo(commitDeadline);
            return { auction, bidder1, salt, price, qty };
        }

        it("Should allow a bidder to reveal a bid and get deposit back", async function () {
            const { auction, bidder1, salt, price, qty } = await loadFixture(committedFixture);
            const escrow = price * BigInt(qty);
            const randPart = ethers.randomBytes(32);

            await expect(auction.connect(bidder1).revealBid(qty, price, salt, randPart, { value: escrow }))
                .to.emit(auction, "Revealed")
                .withArgs(bidder1.address, qty, price);

            expect(await auction.revealedFlag(bidder1.address)).to.be.true;
            expect(await auction.depositOf(bidder1.address)).to.equal(0);
        });
        
        it("Reveal should correctly refund deposit", async function () {
            const { auction, bidder1, salt, price, qty } = await loadFixture(committedFixture);
            const escrow = price * BigInt(qty);
            const randPart = ethers.randomBytes(32);

            // changeEtherBalance works with BigInts
            await expect(auction.connect(bidder1).revealBid(qty, price, salt, randPart, { value: escrow }))
                .to.changeEtherBalance(bidder1, MIN_DEPOSIT - escrow); // Gains deposit back, spends escrow
        });

        it("Should reject reveal with incorrect commit data", async function () {
            const { auction, bidder1, salt, price, qty } = await loadFixture(committedFixture);
            const wrongPrice = price + 1n;
            const escrow = wrongPrice * BigInt(qty);
            await expect(auction.connect(bidder1).revealBid(qty, wrongPrice, salt, ethers.randomBytes(32), { value: escrow }))
                .to.be.revertedWith("commit mismatch");
        });

        it("Should reject reveal with incorrect escrow", async function () {
            const { auction, bidder1, salt, price, qty } = await loadFixture(committedFixture);
            const wrongEscrow = price * BigInt(qty) - 1n;
            await expect(auction.connect(bidder1).revealBid(qty, price, salt, ethers.randomBytes(32), { value: wrongEscrow }))
                .to.be.revertedWith("bad escrow");
        });
    });

    describe("Finalize - Permissions and Rewards", function() {
        // Fixture with one committed bidder
        async function singleCommittedFixture() {
            const { auction, seller, bidder1, nonParticipant, commitDeadline, revealDeadline, finalizeGraceDeadline } = await loadFixture(deployAuctionFixture);
            await auction.connect(bidder1).commitBid(createCommitHash(1, RESERVE_PRICE, ethers.randomBytes(32), bidder1.address), [], { value: MIN_DEPOSIT });
            return { auction, seller, bidder1, nonParticipant, revealDeadline, finalizeGraceDeadline };
        }

        it("Should allow seller to finalize after reveal deadline", async function() {
            const { auction, seller, revealDeadline } = await loadFixture(singleCommittedFixture);
            await time.increaseTo(revealDeadline);
            await expect(auction.connect(seller).finalize()).to.not.be.reverted;
        });

        it("Should prevent participant from finalizing during grace period", async function() {
            const { auction, bidder1, revealDeadline } = await loadFixture(singleCommittedFixture);
            await time.increaseTo(revealDeadline);
            await expect(auction.connect(bidder1).finalize()).to.be.revertedWith("finalize grace active");
        });

        it("Should allow participant to finalize after grace period", async function() {
            const { auction, bidder1, finalizeGraceDeadline } = await loadFixture(singleCommittedFixture);
            await time.increaseTo(finalizeGraceDeadline);
            await expect(auction.connect(bidder1).finalize()).to.not.be.reverted;
        });

        it("Should prevent non-participant from finalizing", async function() {
            const { auction, nonParticipant, finalizeGraceDeadline } = await loadFixture(singleCommittedFixture);
            await time.increaseTo(finalizeGraceDeadline);
            await expect(auction.connect(nonParticipant).finalize()).to.be.revertedWith("only participant");
        });

        it("Should reward participant for finalizing and pay seller remaining proceeds", async function() {
            const { auction, seller, bidder1, bidder2, bidder3, commitDeadline, revealDeadline, finalizeGraceDeadline } = await loadFixture(deployAuctionFixture);

            // Bidder1 will not reveal (gets slashed)
            const salt1 = ethers.randomBytes(32);
            await auction.connect(bidder1).commitBid(createCommitHash(1, ethers.parseEther("0.2"), salt1, bidder1.address), [], { value: MIN_DEPOSIT });

            // Bidder2 will reveal and win
            const bid2 = { qty: 3, price: ethers.parseEther("0.5") };
            const salt2 = ethers.randomBytes(32);
            await auction.connect(bidder2).commitBid(createCommitHash(bid2.qty, bid2.price, salt2, bidder2.address), [], { value: MIN_DEPOSIT });

            // Bidder3 is a participant, will also win, and will finalize
            const salt3 = ethers.randomBytes(32);
            const bid3 = { qty: 1, price: RESERVE_PRICE };
            await auction.connect(bidder3).commitBid(createCommitHash(bid3.qty, bid3.price, salt3, bidder3.address), [], { value: MIN_DEPOSIT });


            await time.increaseTo(commitDeadline);
            // Reveal winning bid
            await auction.connect(bidder2).revealBid(bid2.qty, bid2.price, salt2, ethers.randomBytes(32), { value: bid2.price * BigInt(bid2.qty) });
            // Bidder3 also reveals
            await auction.connect(bidder3).revealBid(bid3.qty, bid3.price, salt3, ethers.randomBytes(32), { value: bid3.price * BigInt(bid3.qty) });


            await time.increaseTo(finalizeGraceDeadline);
            
            // --- CORRECTED LOGIC ---
            // Since total demand (3+1=4) < supply (k=5), all bidders win.
            // The clearing price is the lowest winning bid price, which is bid3.price.
            const clearingPrice = bid3.price;
            const totalUnitsSold = BigInt(bid2.qty + bid3.qty);
            
            // Calculate seller's total proceeds
            const slashedProceeds = MIN_DEPOSIT; // from bidder1
            const salesProceeds = totalUnitsSold * clearingPrice;
            const totalProceedsBeforeReward = slashedProceeds + salesProceeds;
            const sellerProceedsAfterReward = totalProceedsBeforeReward - FINALIZE_REWARD;

            const finalizeTx = auction.connect(bidder3).finalize();
            
            // Bidder3 is a winner, so their escrow is used for payment. They only receive the finalizer reward.
            await expect(finalizeTx).to.changeEtherBalance(bidder3, FINALIZE_REWARD);
            
            // Seller gets total proceeds (slashed deposit + sales) minus the finalizer's reward.
            await expect(finalizeTx).to.changeEtherBalance(seller, sellerProceedsAfterReward);

            // Verify events
            await expect(finalizeTx).to.emit(auction, "FinalizedBy").withArgs(bidder3.address, FINALIZE_REWARD);
            await expect(finalizeTx).to.emit(auction, "Settled").withArgs(clearingPrice, totalUnitsSold, sellerProceedsAfterReward);
            
            // Also check winner events for completeness
            await expect(finalizeTx).to.emit(auction, "Winner").withArgs(bidder2.address, bid2.qty, clearingPrice);
            await expect(finalizeTx).to.emit(auction, "Winner").withArgs(bidder3.address, bid3.qty, clearingPrice);
        });

        it("Should cap the reward if proceeds are insufficient", async function() {
            const { auction, seller, bidder1, bidder2, commitDeadline, finalizeGraceDeadline } = await loadFixture(deployAuctionFixture);
            // Bidder1 is slashed, their deposit is the only source of funds
            await auction.connect(bidder1).commitBid(createCommitHash(1, RESERVE_PRICE, ethers.randomBytes(32), bidder1.address), [], { value: MIN_DEPOSIT });
            // Bidder2 will finalize
            await auction.connect(bidder2).commitBid(createCommitHash(1, RESERVE_PRICE, ethers.randomBytes(32), bidder2.address), [], { value: MIN_DEPOSIT });

            await time.increaseTo(commitDeadline);
            // Neither bidder reveals, but bidder2 will finalize.
            // Bidder2 will lose their deposit as they didn't reveal.
            
            await time.increaseTo(finalizeGraceDeadline);
            
            // Slashed funds from bidder1 (MIN_DEPOSIT) is less than FINALIZE_REWARD.
            // Total slashed funds = 2 * MIN_DEPOSIT
            const totalSlashed = MIN_DEPOSIT * 2n;
            const expectedReward = FINALIZE_REWARD > totalSlashed ? totalSlashed : FINALIZE_REWARD;
            const sellerProceeds = totalSlashed - expectedReward;

            const finalizeTx = auction.connect(bidder2).finalize();

            await expect(finalizeTx).to.changeEtherBalance(bidder2, expectedReward);
            await expect(finalizeTx).to.changeEtherBalance(seller, sellerProceeds);
            await expect(finalizeTx).to.emit(auction, "FinalizedBy").withArgs(bidder2.address, expectedReward);
        });
    });

    describe("Finalize - Scenarios", function () {
        it("Case 1: Supply > Demand (all valid bidders win, finalized by seller)", async function () {
            const { auction, seller, bidder1, bidder2, commitDeadline, revealDeadline } = await loadFixture(deployAuctionFixture);
            const bid1 = { qty: 2, price: ethers.parseEther("0.5") };
            const bid2 = { qty: 1, price: ethers.parseEther("0.4") };
            const salt1 = ethers.randomBytes(32);
            const salt2 = ethers.randomBytes(32);

            // 1. All bidders commit
            await auction.connect(bidder1).commitBid(createCommitHash(bid1.qty, bid1.price, salt1, bidder1.address), [], { value: MIN_DEPOSIT });
            await auction.connect(bidder2).commitBid(createCommitHash(bid2.qty, bid2.price, salt2, bidder2.address), [], { value: MIN_DEPOSIT });

            // 2. Time moves to reveal phase
            await time.increaseTo(commitDeadline);
            
            // 3. All bidders reveal
            await auction.connect(bidder1).revealBid(bid1.qty, bid1.price, salt1, ethers.randomBytes(32), { value: bid1.price * BigInt(bid1.qty) });
            await auction.connect(bidder2).revealBid(bid2.qty, bid2.price, salt2, ethers.randomBytes(32), { value: bid2.price * BigInt(bid2.qty) });
            
            // 4. Time moves past reveal phase
            await time.increaseTo(revealDeadline);
            
            // 5. Finalize and assert
            const clearingPrice = bid2.price; // Lowest winning bid
            const totalSold = BigInt(bid1.qty + bid2.qty);
            const sellerProceeds = clearingPrice * totalSold;

            const tx = await auction.connect(seller).finalize();

            await expect(tx).to.emit(auction, "Winner").withArgs(bidder1.address, bid1.qty, clearingPrice);
            await expect(tx).to.emit(auction, "Winner").withArgs(bidder2.address, bid2.qty, clearingPrice);
            await expect(tx).to.emit(auction, "FinalizedBy").withArgs(seller.address, 0); // Seller finalizes, no reward
            await expect(tx).to.emit(auction, "Settled").withArgs(clearingPrice, totalSold, sellerProceeds);

            await expect(auction.connect(seller).finalize()).to.be.revertedWith("settled");
        });

        it("Case 2: Supply < Demand (clear winners and losers, finalized by seller)", async function () {
            const { auction, seller, bidder1, bidder2, bidder3, commitDeadline, revealDeadline } = await loadFixture(deployAuctionFixture);
            const bid1 = { qty: 3, price: ethers.parseEther("0.5") }; // Full Winner
            const bid2 = { qty: 3, price: ethers.parseEther("0.4") }; // Partial Winner (2 units)
            const bid3 = { qty: 3, price: ethers.parseEther("0.3") }; // Loser
            const salts = [ethers.randomBytes(32), ethers.randomBytes(32), ethers.randomBytes(32)];

            // 1. Commit phase
            await auction.connect(bidder1).commitBid(createCommitHash(bid1.qty, bid1.price, salts[0], bidder1.address), [], { value: MIN_DEPOSIT });
            await auction.connect(bidder2).commitBid(createCommitHash(bid2.qty, bid2.price, salts[1], bidder2.address), [], { value: MIN_DEPOSIT });
            await auction.connect(bidder3).commitBid(createCommitHash(bid3.qty, bid3.price, salts[2], bidder3.address), [], { value: MIN_DEPOSIT });
            
            // 2. Reveal phase
            await time.increaseTo(commitDeadline);
            await auction.connect(bidder1).revealBid(bid1.qty, bid1.price, salts[0], ethers.randomBytes(32), { value: bid1.price * 3n });
            await auction.connect(bidder2).revealBid(bid2.qty, bid2.price, salts[1], ethers.randomBytes(32), { value: bid2.price * 3n });
            await auction.connect(bidder3).revealBid(bid3.qty, bid3.price, salts[2], ethers.randomBytes(32), { value: bid3.price * 3n });

            // 3. Finalize
            await time.increaseTo(revealDeadline);
            
            const clearingPrice = bid2.price;
            const bidder1UnitsWon = 3n;
            const bidder2UnitsWon = 2n; // k=5, bidder1 took 3, 2 remain
            const bidder1Cost = clearingPrice * bidder1UnitsWon;
            const bidder2Cost = clearingPrice * bidder2UnitsWon;
            
            const sellerProceeds = bidder1Cost + bidder2Cost;
            
            const tx = auction.connect(seller).finalize();

            await expect(tx).to.emit(auction, "Winner").withArgs(bidder1.address, bidder1UnitsWon, clearingPrice);
            await expect(tx).to.emit(auction, "Winner").withArgs(bidder2.address, bidder2UnitsWon, clearingPrice);
            await expect(tx).to.emit(auction, "FinalizedBy").withArgs(seller.address, 0);
            await expect(tx).to.emit(auction, "Settled").withArgs(clearingPrice, K_UNIFORM, sellerProceeds);

            // Check refunds via balance changes
            const bidder1Refund = (bid1.price * 3n) - bidder1Cost; // Refund for overpayment
            const bidder2Refund = (bid2.price * 3n) - bidder2Cost; // Refund for overpayment + unsold unit
            const bidder3Refund = bid3.price * 3n; // Full refund for loser

            await expect(() => tx).to.changeEtherBalances(
                [bidder1, bidder2, bidder3, seller],
                [bidder1Refund, bidder2Refund, bidder3Refund, sellerProceeds]
            );
        });
    });
});
