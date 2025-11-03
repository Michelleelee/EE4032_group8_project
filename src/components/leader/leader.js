import { Navigate } from "react-router-dom";

import "./leader.css";
import "../../global.css";
import { GlobalToolBar } from "../../global";

export default function Leader(props){

    const LeaderIntro = () => {
        return (
            <div className = "leader-intro">
                <p>
                   &emsp;Here a contract is applied to select a leader between 2 players.
                   Each player commit a bit and revealed them after both commits are made.
                   The leader is elected by taking the xor of the two bit.
                   Only the leader can force the reset at anytime, others need to wait a minimum amount of time.
                   One could give more power to leader allowing him to do more transactions.
                </p>
            </div>
        )
    }

    const CommitBitPanel = () => {
        return (
            <div>
                Input a bit and a key(integer) separated by ','
                <br />
                <input width = "30px" type = "text" id = "CommitVal" placeholder="bit,key"></input>
                <br />
                <div className = "leader-commitBox">
                    <button className = "btn" onClick = {props.commitValHandle}>
                        Commit
                    </button>
                    {   
                        props.electionOn ?
                            <span>
                                {
                                    props.commitDone ?
                                    <span>
                                        {
                                            props.commitPending ?
                                            <span>Pending... </span>:
                                            <span>Commit Accepted! </span>
                                        }
                                    </span> : 
                                    <span>
                                        {
                                            props.commitPending ?
                                            <span>Pending... </span>:
                                            <span>Commit Rejected </span>
                                        }
                                    </span>
                                }
                            </span>:
                            <span>Submit commit </span>
                            
                    }
                </div>
            </div>
        )
    }

    const RevealBitPanel = () => {
        return (
            <div>
                Input your bit and your key separated by ','
                <br />
                <input width = "30px" type = "text" id = "RevealVal" placeholder="bit,key"></input>
                <br />
                <div className = "leader-revealBox">
                    <button className = "btn" onClick = {props.revealVal}>
                        Reveal
                    </button>
                    {
                        props.revealOn ?
                        <span>
                        {
                            props.revealPending ?
                            <span>
                            {
                                props.revealAccepted ?
                                <span>Reveal Accepted </span>:
                                <span>Pending... </span>
                            }
                            </span> : 
                            <span>
                            {
                                props.revealAccepted ?
                                <span>Reveal Accepted </span>:
                                <span>Try reveal </span>
                            }
                            </span>
                        }
                        </span>:
                        <span>
                            Wait for commit
                        </span>        
                    }
                </div>
            </div>
        )
    }

    const ResetLeaderPanel = () => {
        return (
            <div>
                Click 'Reset' to reset the election if allowed:&nbsp;
                <br />
                <button className = "btn" onClick = {props.resetHandle}>
                    Reset
                </button>
                {   
                    props.electionOn ?
                    <span>
                        {
                            props.resetDone ?
                            <span>Reset Done! </span>:
                            <span>Election on</span>
                        }
                    </span>:
                    <span>No election on</span>

                    }
            </div>
        )
    }

    const GetLeaderPanel = () => {
        return (
            <div>
                <div>
                    <span classeName = "global-message">
                    {
                        props.elected ?
                        <span>Leader elected</span>:
                        <span>No leader</span>
                    }
                </span>
                </div>
                Click 'Get Leader' to get the address of the leader:&nbsp;
                <span className = "global-message">
                    {props.showLeader}
                </span>
                <button className = "btn" onClick = {props.showLeaderHandle}>
                    Get Leader
                </button>
            </div>
        )
    }

       const LeaderPanel = () => {
        return (
            <div className = "leader-box">
                <CommitBitPanel/>
                <br/>
                <RevealBitPanel/>
                <br/>
                <GetLeaderPanel/>
                <br/>
                <ResetLeaderPanel/>
            </div>
        )
    }

    const LeaderPage = () => {
        return (
            <div className = "leader-background">
                <h1>Leader Election Page</h1>
                <div className = "leader">
                    <LeaderIntro/>
                    <div className = "leader-vertLine">
                        <p>&nbsp;<br/>&nbsp;<br/>&nbsp;<br/>&nbsp;<br/>&nbsp;<br/>&nbsp;</p>
                    </div>
                    <LeaderPanel/>
                </div>

                <GlobalToolBar/>
            </div>
        )
    }


    return (
        <div>
            {
                props.isConnected ?
                <LeaderPage />:
                <Navigate to = '/InterfaceDemo' />
            }
        </div>
    )
}
