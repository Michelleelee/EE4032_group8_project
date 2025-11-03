import {Routes, Route} from "react-router-dom";
import {useNavigate} from "react-router-dom";
import {useEffect, useState} from 'react';
import {ethers} from 'ethers';
import Web3 from "web3";

import './App.css';
import Login from "./components/login/login";
import Profile from "./components/profile/profile";
import Storage from "./components/storage/storage";
import History from "./components/history/history";
import Leader from "./components/leader/leader";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "./contracts/config";
import { CONTRACT_ABI_2, CONTRACT_ADDRESS_2 } from "./contracts/config_2";

// ==== Auction imports (new) ====
import Auction from "./components/auction/auction";
import { CONTRACT_ABI_AUCTION, CONTRACT_ADDRESS_AUCTION } from "./contracts/config_auction";
// =================================

export default function App() {
    const [haveMetamask, setHaveMetamask] = useState(true);     // check if the browser has MetaMask installed. 
    const [address, setAddress] = useState(null);               // address of connected MetaMask account. 
    const [network, setNetwork] = useState(null);               // network the account is using. 
    const [balance, setBalance] = useState(0);                  // balance of connected MetaMask account. 
    const [isConnected, setIsConnected] = useState(false);      // check if is connected to MetaMask account. 

    const [storedPending, setStoredPending] = useState(false);        // check if a value is pending. 
    const [storedDone, setStoredDone] = useState(false);        // check if a value is stored. 
    const [storedVal, setStoredVal] = useState(0);              // value that is stored right now. 
    const [showVal, setShowVal] = useState(0);                  // value that is showed on screen. 

    const [historyRecord, setHistoryRecord] = useState(null);   // record of history operations. 
    const [recordLen, setRecordLen] = useState(0);              // length of record. 
    const maxRecordLen = 50;                                    // maximum length of record list.                        

    const [commitPending, setCommitPending] = useState(false);
    const [commitDone, setCommitDone] = useState(false);
    const [revealPending, setRevealPending] = useState(false);
    const [revealAccepted, setRevealAccepted] = useState(false);
    const [resetDone, setResetDone] = useState(false);
    const [showLead, setShowLead] = useState("0x0000000000000000000000000000000000000000");
    const [electionOn, setElectionOn] = useState(false);
    const [revealOn, setRevealOn] =useState(false);
    const [elected, setElected] = useState(false)

    // ==== Auction states (new) ====
    const [kUnits, setKUnits] = useState(0);
    const [reservePrice, setReservePrice] = useState(0);
    const [minDeposit, setMinDeposit] = useState(0);
    const [commitDeadline, setCommitDeadline] = useState(0);
    const [revealDeadline, setRevealDeadline] = useState(0);
    const [whitelistOn, setWhitelistOn] = useState(false);
    const [settled, setSettled] = useState(false);
    const [clearingPrice, setClearingPrice] = useState(0);
    const [auctionCommitPending, setAuctionCommitPending] = useState(false);
    const [auctionCommitDone, setAuctionCommitDone] = useState(false);
    const [auctionRevealPending, setAuctionRevealPending] = useState(false);
    const [auctionRevealDone, setAuctionRevealDone] = useState(false);
    // =================================

    const navigate = useNavigate();
    const {ethereum} = window;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const web3 = new Web3(window.ethereum || "http://localhost:8545");
    const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
    const contract_2 = new web3.eth.Contract(CONTRACT_ABI_2, CONTRACT_ADDRESS_2);
    // ==== Auction contract instance (new) ====
    const contract_auction = new web3.eth.Contract(CONTRACT_ABI_AUCTION || [], CONTRACT_ADDRESS_AUCTION || "0x0000000000000000000000000000000000000000");
    // ========================================

////// connect to MetaMask. 
    const connectWallet = async () => {         // function that connect to METAMASK account, activated when clicking on 'connect'. 
        try {
            if (!ethereum){
                setHaveMetamask(false);
            }
            const accounts = await ethereum.request({
                method: 'eth_requestAccounts',
            });
            const chainId = await ethereum.request({
                method: 'eth_chainId',
            });

            let balanceVal = await provider.getBalance(accounts[0]);
            let bal = ethers.utils.formatEther(balanceVal);

            console.log(chainId);
            if (chainId === '0x3'){
                setNetwork('Ropsten Test Network');
            }
            else if (chainId === '0x5'){
                setNetwork('Goerli Test Network');
            }
            else if (chainId === '0xaa36a7'){
                setNetwork('Sepolia Test Network');
            }
            else {
                setNetwork('Other Test Network');
            }
            setAddress(accounts[0]);
            setBalance(bal);
            setIsConnected(true);

            navigate("/InterfaceDemo/profile");
        }
        catch (error){
            setIsConnected(false);
        }
    }


////// Contract Deployment. 
    // IMPORTANT: async / await is essential to get values instead of Promise. 
    const storeData = async (inputVal) => {
        const res = await contract.methods.set(inputVal).send({from: address});
        return res;
    }

    const getData = async () => {
        const res = await contract.methods.get().call();
        return res;
    }

    
////// history recording. 
    const RecordOverFlow = () => {
        if (recordLen > maxRecordLen){
            let outlierNum = recordLen - maxRecordLen;
            setHistoryRecord(current => current.splice(1, outlierNum));
            setRecordLen(maxRecordLen);
        }
    }

    const RecordPush = (opr, val, detail) => {
        let stat = 1;
        let cost = 0;
        if (val.length === 0){
            val = 'NA';
            cost = 'NA';
            stat = 0;
        }
        else{
            if (opr === 'get'){
                cost = 0;
                stat = 1;
            }
            else{
                if (detail === 'null'){
                    setStoredPending(false);
                    setStoredDone(true);
                    console.log('Rejected');
                    cost = 'NA';
                    stat = 2;
                }
                else{
                    setStoredDone(true);
                    console.log('Done');
                    console.log(detail);    // show the details of transaction. 
                    cost = detail.gasUsed;
                    stat = 1;
                }
            }
        }

        const newRecord = {
            id: recordLen + 1, 
            address: address, 
            operation: opr, 
            value: val, 
            cost: cost, 
            status: stat
        };
        if (recordLen === 0){
            setHistoryRecord([newRecord, newRecord]);
        }
        else{
            setHistoryRecord(current => [...current, newRecord]);
        }
        setRecordLen(recordLen + 1);

        if (recordLen > maxRecordLen){
            RecordOverFlow();
        }
    }

////// Leader election
    const commitValUpdate = async () => {
        const commitVal = document.getElementById("CommitVal").value;
        setCommitPending(true);
        setCommitDone(false);
        setResetDone(false);

        if (commitVal.length !== 0){
            setElectionOn(true);
            const [bit,key] = commitVal.split(",").map(Number);
            try {
                let res = await contract_2.methods.Commit(bit,key).send({from : address});
                setCommitDone(true);
            }   
            catch(err){
                setCommitDone(false);
                console.log('error Commit');
            }
        }
        else {
            console.log('No entry')
        }
        setCommitPending(false);

    }

    const revealVal = async () => {
        const revealVal = document.getElementById('RevealVal').value;
        setRevealAccepted(false);
        setRevealPending(true);

        if (revealVal.length !== 0){
            setRevealPending(true)
            let [bit,key] = await revealVal.split(",").map(Number);
            try {
                let res = await contract_2.methods.Reveal(bit,key).send({from : address});
                setRevealAccepted(true);
            }   
            catch(err){
                setRevealAccepted(false);
                console.log('error Reveal');
            }
        }
        else {
            console.log('No entry');
        }
        setRevealPending(false)
    }

    const resetHandle = async () => {
        try{
            let res = await contract_2.methods.election_reset().send({from : address});
            setElectionOn(false)
            setRevealOn(false)
            setElected(false)
        }
        catch{
        }
    }
    useEffect(()=>{
        contract_2.events.leader_elected().on("data",() =>{
            setElected(true)
        });
        return () => {
            contract_2.removeAllListeners("leader_elected")
        };
    },[contract_2]);

    useEffect(()=>{
        contract_2.events.reveal_on().on("data",() =>{
            setRevealOn(true)
        });
        return () => {
            contract_2.removeAllListeners("reveal_on")
        };
    },[contract_2]);

    useEffect(()=>{
        contract_2.events.reset_done().on("data",() =>{
            setResetDone(true)
            setElectionOn(false)
            setRevealOn(false)
            setElected(false)
        });
        return () => {
            contract_2.removeAllListeners("reset_done")
        };
    },[contract_2]);

    const getLeader = async () => {
        let res = await contract_2.methods.get_leader().call();
        return res;
    }
////// store and get value. 
    const storedValUpdate = async () => {
        const inputVal = document.getElementById('inputVal').value;
        setStoredPending(false);
        setStoredDone(false);

        if (inputVal.length === 0) {
            const detail = 'null';
            RecordPush('store', inputVal, detail);
        }
        else {
            setStoredPending(true);
            setStoredVal(inputVal);
            
            try{
                const detail = await storeData(inputVal);   // contract deployed. 
                RecordPush('store', inputVal, detail);      // recorded. 
            }
            catch(err){
                const detail = 'null';                      // no detail info. 
                RecordPush('store', inputVal, detail);      // recorded. 
            }
        }
    }

    const showValUpdate = async () => {
        const ans = await getData();
        setStoredPending(false);
        setStoredDone(false);

        setShowVal(ans);
        RecordPush('get', ans);
    }

    const showLeaderUpdate = async () => {
        let ans = await getLeader();
        setShowLead(ans);
    }

    // ==== Auction: read static status & listen events (new) ====
    useEffect(() => {
        async function readAuctionStatic() {
            try {
                if (!CONTRACT_ADDRESS_AUCTION || (CONTRACT_ABI_AUCTION || []).length === 0) return;
                const k_ = await contract_auction.methods.k().call();
                const rsv = await contract_auction.methods.reservePrice().call();
                const dep = await contract_auction.methods.minDeposit().call();
                const cd  = await contract_auction.methods.commitDeadline().call();
                const rd  = await contract_auction.methods.revealDeadline().call();
                const wOn = await contract_auction.methods.whitelistOn().call();
                const st  = await contract_auction.methods.settled().call();
                setKUnits(Number(k_));
                setReservePrice(Number(rsv));
                setMinDeposit(Number(dep));
                setCommitDeadline(Number(cd));
                setRevealDeadline(Number(rd));
                setWhitelistOn(Boolean(wOn));
                setSettled(Boolean(st));
            } catch (e) {
                console.log("Read auction static info failed:", e);
            }
        }
        readAuctionStatic();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    useEffect(() => {
        if (!contract_auction || (CONTRACT_ABI_AUCTION || []).length === 0) return;
        // I listen to the 'Settled' event to display the clearing price
        contract_auction.events.Settled().on("data", (ev) => {
            setSettled(true);
            try {
                setClearingPrice(Number(ev.returnValues.clearingPrice));
            } catch (_) {
                // ignore
            }
        });
        return () => {
            try { contract_auction.removeAllListeners("Settled"); } catch (_) {}
        };
    }, [contract_auction]);
    // ===========================================

    // ==== Auction handlers (new) ====
    const onCommit = async () => {
        setAuctionCommitPending(true); setAuctionCommitDone(false);
        try {
            const qty = Number(document.getElementById("AuctionCommitQty").value);
            const price = Number(document.getElementById("AuctionCommitPrice").value);
            const saltInput = document.getElementById("AuctionCommitSalt").value;
            const proofStr  = document.getElementById("AuctionCommitProof").value.trim();

            const saltBytes = web3.utils.keccak256(saltInput);
            const commitHash = web3.utils.soliditySha3(
                {t:'uint256', v: qty},
                {t:'uint256', v: price},
                {t:'bytes32', v: saltBytes},
                {t:'address', v: address}
            );

            let proof = [];
            if (proofStr.length > 0) {
                proof = proofStr.split(",").map(s => s.trim());
            }

            // always read minDeposit to avoid zero before state loads
            const dep = await contract_auction.methods.minDeposit().call();

            await contract_auction.methods.commitBid(commitHash, proof).send({
                from: address,
                value: dep
            });

            setAuctionCommitDone(true);
        } catch (err) {
            console.log("Commit failed:", err);
            setAuctionCommitDone(false);
        }
        setAuctionCommitPending(false);
    };

    // ==== Modified onReveal: auto-generate randPart if input is missing/empty ====
    const onReveal = async () => {
        setAuctionRevealPending(true); setAuctionRevealDone(false);
        try {
            const qty = Number(document.getElementById("AuctionRevealQty").value);
            const price = Number(document.getElementById("AuctionRevealPrice").value);
            const saltInput = document.getElementById("AuctionRevealSalt").value;

            // Try read optional randPart input; if absent or empty, auto-generate one.
            const randEl = document.getElementById("AuctionRevealRand");
            const randInput = (randEl && randEl.value && randEl.value.length > 0)
                ? randEl.value
                : (address + ":" + Date.now().toString());

            const saltBytes = web3.utils.keccak256(saltInput);
            const randBytes = web3.utils.keccak256(randInput);

            // value: price * qty (use BN to avoid overflow)
            const val = web3.utils.toBN(String(price)).mul(web3.utils.toBN(String(qty))).toString();

            await contract_auction.methods.revealBid(qty, price, saltBytes, randBytes).send({
                from: address,
                value: val
            });

            setAuctionRevealDone(true);
        } catch (err) {
            console.log("Reveal failed:", err);
            setAuctionRevealDone(false);
        }
        setAuctionRevealPending(false);
    };

    const onFinalize = async () => {
        try {
            await contract_auction.methods.finalize().send({ from: address });
            const st  = await contract_auction.methods.settled().call();
            setSettled(Boolean(st));
        } catch (err) {
            console.log("Finalize failed:", err);
        }
    };
    // =================================

////// display functions. 
    const ProfileDisplay = () => {
        return (
            <Profile 
                isConnected = {isConnected}
                address = {address} 
                networkType = {network} 
                balance = {balance}
            />
        )
    }

    const StorageDisplay = () => {
        return (
            <Storage 
                isConnected = {isConnected}
                storeValHandle = {storedValUpdate} 
                showValHandle = {showValUpdate} 
                showVal = {showVal} 
                storedPending = {storedPending}
                storedDone = {storedDone}
            />
        )
    }

    const HistoryDisplay = () => {
        return (
            <History 
                isConnected = {isConnected}
                recordList = {historyRecord}
                recordLen = {recordLen}
            />
        )
    }

    const LeaderDisplay = () =>{
        return(
            <Leader
                isConnected = {isConnected}
                commitValHandle = {commitValUpdate}
                showLeader = {showLead}
                commitDone = {commitDone}
                commitPending = {commitPending}
                revealVal = {revealVal}
                revealPending = {revealPending}
                revealAccepted = {revealAccepted}
                showLeaderHandle = {showLeaderUpdate}
                resetHandle = {resetHandle}
                resetDone = {resetDone}
                electionOn = {electionOn}
                revealOn = {revealOn}
                elected = {elected}
            />
        )
    }

    // ==== Auction display wrapper (new) ====
    const AuctionDisplay = () => {
        return (
            <Auction
                isConnected={isConnected}
                // read-only status
                kUnits={kUnits}
                reservePrice={reservePrice}
                minDeposit={minDeposit}
                commitDeadline={commitDeadline}
                revealDeadline={revealDeadline}
                whitelistOn={whitelistOn}
                settled={settled}
                clearingPrice={clearingPrice}
                // actions
                onCommit={onCommit}
                onReveal={onReveal}
                onFinalize={onFinalize}
                // ui state
                commitPending={auctionCommitPending}
                commitDone={auctionCommitDone}
                revealPending={auctionRevealPending}
                revealDone={auctionRevealDone}
            />
        )
    }
    // ========================================

    return (
        <div className="App">
            <Routes>
                <Route path = "/EE4032" element = {<Login isHaveMetamask = {haveMetamask} connectTo = {connectWallet} />}></Route>
                <Route path = "/InterfaceDemo/profile" element = {<ProfileDisplay/>}></Route>
                <Route path = "/InterfaceDemo/storage" element = {<StorageDisplay/>}></Route>
                <Route path = "/InterfaceDemo/history" element = {<HistoryDisplay/>}></Route>
                <Route path = "/InterfaceDemo/leader" element = {<LeaderDisplay/>}></Route>
                {/* new auction route */}
                <Route path = "/InterfaceDemo/auction" element = {<AuctionDisplay/>}></Route>
            </Routes>
        </div>
    );
}