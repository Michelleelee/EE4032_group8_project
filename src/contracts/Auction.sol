// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/// @title Sealed-Bid k-Unit Uniform-Price Auction (no anti-sniping)
/// @notice I implement commit–reveal with optional Merkle whitelist, reserve price,
///         per-bidder quantity, deposit slashing for no-reveal, escrow at reveal,
///         and deterministic tie-breaking using XOR-aggregated randomness.
contract Auction {
    address public immutable seller;
    uint256 public immutable k;
    uint256 public immutable reservePrice;
    uint256 public immutable minDeposit;
    uint256 public immutable finalizeReward;
    bytes32 public immutable whitelistRoot;
    bool    public immutable whitelistOn;

    uint256 public commitDeadline;
    uint256 public revealDeadline;

    bool public settled;
    uint256 public immutable finalizeGrace;

    mapping(address => bytes32) public commitOf;
    mapping(address => bool)    public hasCommit;
    address[] public committers;

    mapping(address => uint256) public depositOf;

    struct Bid { address bidder; uint256 price; uint256 qty; }
    Bid[] public revealed;
    mapping(address => bool) public revealedFlag;

    bytes32 public randXor;

    event Committed(address indexed bidder, bytes32 commitHash);
    event Revealed(address indexed bidder, uint256 qty, uint256 price);
    event Slashed(address indexed bidder, uint256 amount);
    event Winner(address indexed bidder, uint256 unitsWon, uint256 payPerUnit);
    event Settled(uint256 clearingPrice, uint256 totalUnitsSold, uint256 sellerProceeds);
    event FinalizedBy(address indexed finalizer, uint256 reward);

    constructor(
        uint256 _k,
        uint256 commitDuration,
        uint256 revealDuration,
        uint256 _reservePrice,
        uint256 _minDeposit,
        uint256 _finalizeGrace,
        uint256 _finalizeReward,
        bytes32 _whitelistRoot,
        bool _whitelistOn
    ) {
        require(_k > 0, "k=0");
        require(commitDuration > 0 && revealDuration > 0, "bad durations");
        require(_finalizeGrace > 0, "bad finalize grace");
        seller         = msg.sender;
        k              = _k;
        reservePrice   = _reservePrice;
        minDeposit     = _minDeposit;
        finalizeReward = _finalizeReward;
        whitelistRoot  = _whitelistRoot;
        whitelistOn    = _whitelistOn;

        commitDeadline = block.timestamp + commitDuration;
        revealDeadline = commitDeadline + revealDuration;
        finalizeGrace  = _finalizeGrace;
    }

    function _verifyWhitelist(bytes32[] calldata proof, bytes32 leaf) internal view returns (bool ok) {
        if (!whitelistOn) return true;
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            if (h < p) h = keccak256(abi.encodePacked(h, p));
            else       h = keccak256(abi.encodePacked(p, h));
        }
        return h == whitelistRoot;
    }

    function inCommit() public view returns (bool) {
        return block.timestamp < commitDeadline;
    }
    function inReveal() public view returns (bool) {
        return block.timestamp >= commitDeadline && block.timestamp < revealDeadline;
    }

    /// @param commitHash keccak256(qty, price, salt, bidder)
    function commitBid(bytes32 commitHash, bytes32[] calldata proof) external payable {
        require(inCommit(), "commit closed");
        require(!hasCommit[msg.sender], "already committed");
        if (whitelistOn) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            require(_verifyWhitelist(proof, leaf), "not whitelisted");
        }
        require(msg.value >= minDeposit, "deposit too small");

        commitOf[msg.sender] = commitHash;
        hasCommit[msg.sender] = true;
        depositOf[msg.sender] += msg.value;
        committers.push(msg.sender);

        emit Committed(msg.sender, commitHash);
    }

    function revealBid(uint256 qty, uint256 price, bytes32 salt, bytes32 randPart) external payable {
        require(inReveal(), "reveal not open");
        require(hasCommit[msg.sender], "no commit");
        require(!revealedFlag[msg.sender], "already revealed");
        require(qty > 0, "qty=0");

        bytes32 chk = keccak256(abi.encodePacked(qty, price, salt, msg.sender));
        require(chk == commitOf[msg.sender], "commit mismatch");

        uint256 need = price * qty;
        require(msg.value == need, "bad escrow");

        revealed.push(Bid({bidder: msg.sender, price: price, qty: qty}));
        revealedFlag[msg.sender] = true;

        uint256 dep = depositOf[msg.sender];
        if (dep > 0) {
            depositOf[msg.sender] = 0;
            (bool ok,) = payable(msg.sender).call{value: dep}("");
            require(ok, "deposit refund failed");
        }

        randXor ^= salt ^ randPart;
        emit Revealed(msg.sender, qty, price);
    }

    function finalizeGraceDeadline() external view returns (uint256) {
        return revealDeadline + finalizeGrace;
    }

    function finalize() external {
        bool sellerFinalize = msg.sender == seller;
        if (!sellerFinalize) {
            require(block.timestamp >= revealDeadline + finalizeGrace, "finalize grace active");
            require(hasCommit[msg.sender], "only participant");
        }
        require(!settled, "settled");
        require(block.timestamp >= revealDeadline, "reveal not ended");
        settled = true;

        bool rewardEligible = !sellerFinalize && finalizeReward > 0;
        uint256 reward = 0;

        uint256 slashed = 0;
        for (uint256 i = 0; i < committers.length; i++) {
            address a = committers[i];
            if (hasCommit[a] && !revealedFlag[a]) {
                uint256 dep = depositOf[a];
                if (dep > 0) {
                    depositOf[a] = 0;
                    slashed += dep;
                    emit Slashed(a, dep);
                }
            }
        }

        uint256 n = revealed.length;
        if (n == 0) {
            uint256 sellerAmount = slashed;
            if (rewardEligible) {
                uint256 desired = finalizeReward;
                if (desired > sellerAmount) desired = sellerAmount;
                reward = desired;
                if (reward > 0) {
                    sellerAmount -= reward;
                    (bool okF0,) = payable(msg.sender).call{value: reward}("");
                    require(okF0, "finalizer reward fail");
                }
            }
            if (sellerAmount > 0) {
                (bool ok0,) = payable(seller).call{value: sellerAmount}("");
                require(ok0, "slash xfer fail");
            }
            emit FinalizedBy(msg.sender, reward);
            emit Settled(0, 0, sellerAmount);
            return;
        }

        Bid[] memory arr = new Bid[](n);
        uint256 m = 0;
        for (uint256 i = 0; i < n; i++) {
            if (revealed[i].price >= reservePrice) {
                arr[m++] = revealed[i];
            } else {
                uint256 refundBelow = revealed[i].price * revealed[i].qty;
                (bool okB,) = payable(revealed[i].bidder).call{value: refundBelow}("");
                require(okB, "refund below reserve fail");
            }
        }
        if (m == 0) {
            uint256 sellerAmount2 = slashed;
            if (rewardEligible) {
                uint256 desired2 = finalizeReward;
                if (desired2 > sellerAmount2) desired2 = sellerAmount2;
                reward = desired2;
                if (reward > 0) {
                    sellerAmount2 -= reward;
                    (bool okF1,) = payable(msg.sender).call{value: reward}("");
                    require(okF1, "finalizer reward fail");
                }
            }
            if (sellerAmount2 > 0) {
                (bool ok1,) = payable(seller).call{value: sellerAmount2}("");
                require(ok1, "slash xfer fail");
            }
            emit FinalizedBy(msg.sender, reward);
            emit Settled(0, 0, sellerAmount2);
            return;
        }

        for (uint256 i = 0; i < m; i++) {
            for (uint256 j = i + 1; j < m; j++) {
                if (arr[j].price > arr[i].price) {
                    Bid memory t = arr[i];
                    arr[i] = arr[j];
                    arr[j] = t;
                }
            }
        }

        uint256 remaining = k;
        uint256 totalSold = 0;
        uint256 clearing = 0;

        uint256 iStart = 0;
        while (iStart < m && remaining > 0) {
            uint256 levelPrice = arr[iStart].price;
            uint256 iEnd = iStart;
            uint256 sumQty = 0;
            while (iEnd < m && arr[iEnd].price == levelPrice) {
                sumQty += arr[iEnd].qty;
                iEnd++;
            }
            if (sumQty <= remaining) {
                for (uint256 t = iStart; t < iEnd; t++) {
                    remaining -= arr[t].qty;
                    totalSold += arr[t].qty;
                }
                clearing = levelPrice;
            } else {
                uint256 L = iEnd - iStart;
                uint256[] memory order = new uint256[](L);
                for (uint256 z = 0; z < L; z++) order[z] = z;

                bytes32 seed = keccak256(abi.encodePacked(randXor, levelPrice, L));
                for (uint256 z = 0; z < L; z++) {
                    uint256 r = uint256(keccak256(abi.encodePacked(seed, z))) % (L - z);
                    uint256 picked = z + r;
                    (order[z], order[picked]) = (order[picked], order[z]);
                }

                for (uint256 z = 0; z < L && remaining > 0; z++) {
                    Bid memory b = arr[iStart + order[z]];
                    uint256 give = b.qty <= remaining ? b.qty : remaining;
                    remaining -= give;
                    totalSold += give;
                }
                clearing = levelPrice;
            }
            iStart = iEnd;
        }

        if (totalSold == 0) {
            uint256 sellerAmount3 = slashed;
            if (rewardEligible) {
                uint256 desired3 = finalizeReward;
                if (desired3 > sellerAmount3) desired3 = sellerAmount3;
                reward = desired3;
                if (reward > 0) {
                    sellerAmount3 -= reward;
                    (bool okF2,) = payable(msg.sender).call{value: reward}("");
                    require(okF2, "finalizer reward fail");
                }
            }
            if (sellerAmount3 > 0) {
                (bool ok2,) = payable(seller).call{value: sellerAmount3}("");
                require(ok2, "slash xfer fail");
            }
            emit FinalizedBy(msg.sender, reward);
            emit Settled(0, 0, sellerAmount3);
            return;
        }

        uint256 sellerProceeds = slashed;

        remaining = k;
        iStart = 0;
        while (iStart < m) {
            uint256 levelPrice = arr[iStart].price;
            uint256 iEnd = iStart;
            while (iEnd < m && arr[iEnd].price == levelPrice) iEnd++;
            if (levelPrice > clearing) {
                for (uint256 t = iStart; t < iEnd; t++) {
                    uint256 take = arr[t].qty <= remaining ? arr[t].qty : remaining;
                    remaining -= take;
                    sellerProceeds += clearing * take;
                    uint256 refund = (arr[t].price - clearing) * take + (arr[t].price * (arr[t].qty - take));
                    if (refund > 0) {
                        (bool okR,) = payable(arr[t].bidder).call{value: refund}("");
                        require(okR, "refund fail");
                    }
                    emit Winner(arr[t].bidder, take, clearing);
                }
            } else if (levelPrice == clearing) {
                uint256 L = iEnd - iStart;
                uint256[] memory order = new uint256[](L);
                for (uint256 z = 0; z < L; z++) order[z] = z;
                bytes32 seed = keccak256(abi.encodePacked(randXor, levelPrice, L));
                for (uint256 z = 0; z < L; z++) {
                    uint256 r = uint256(keccak256(abi.encodePacked(seed, z))) % (L - z);
                    uint256 picked = z + r;
                    (order[z], order[picked]) = (order[picked], order[z]);
                }
                for (uint256 z = 0; z < L; z++) {
                    Bid memory b = arr[iStart + order[z]];
                    if (remaining == 0) {
                        uint256 rf = b.price * b.qty;
                        (bool okL,) = payable(b.bidder).call{value: rf}("");
                        require(okL, "refund loser fail");
                        continue;
                    }
                    uint256 give = b.qty <= remaining ? b.qty : remaining;
                    remaining -= give;

                    sellerProceeds += clearing * give;
                    uint256 refund = (b.price - clearing) * give + (b.price * (b.qty - give));
                    if (refund > 0) {
                        (bool okR2,) = payable(b.bidder).call{value: refund}("");
                        require(okR2, "refund fail");
                    }
                    emit Winner(b.bidder, give, clearing);
                }
            } else {
                for (uint256 t = iStart; t < iEnd; t++) {
                    uint256 rf = arr[t].price * arr[t].qty;
                    (bool okL2,) = payable(arr[t].bidder).call{value: rf}("");
                    require(okL2, "refund loser fail");
                }
            }
            iStart = iEnd;
        }

        uint256 sellerPayout = sellerProceeds;
        if (rewardEligible) {
            uint256 desiredReward = finalizeReward;
            if (desiredReward > sellerPayout) desiredReward = sellerPayout;
            reward = desiredReward;
            if (reward > 0) {
                sellerPayout -= reward;
                (bool okF,) = payable(msg.sender).call{value: reward}("");
                require(okF, "finalizer reward fail");
            }
        }

        if (sellerPayout > 0) {
            (bool okS,) = payable(seller).call{value: sellerPayout}("");
            require(okS, "seller transfer fail");
        }

        emit FinalizedBy(msg.sender, reward);
        emit Settled(clearing, totalSold, sellerPayout);
    }

    function getCommitters() external view returns (address[] memory) { return committers; }
    function getRevealedCount() external view returns (uint256) { return revealed.length; }
}
