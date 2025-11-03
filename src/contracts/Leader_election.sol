// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.18;

contract elect_Leader {
    address[2] players;
    uint8 public nb_player;
    mapping(address => bool) public commited;
    mapping(address => bytes32) public commits;
    mapping(address => uint8) public bits;
    mapping(address => bool) public revealed;
    address public leader;
    uint256 public time_commit;
    uint256 public time_leader;
    event leader_elected();
    event reset_done();
    event reveal_on();


    constructor(){
        leader = address(0);
        nb_player = 0;
    }

    function Commit(uint8 input,uint256 key) public {
        require(nb_player < 2, "Only two players can play");
        require(commited[msg.sender] == false, 'already commited');
        require(input == 0 || input == 1, 'need to input a bit');
        if (nb_player == 0){
            players[0] = msg.sender;
            time_commit = block.timestamp;
        }
        else if (nb_player == 1){
            players[1] = msg.sender;
            emit reveal_on();

        }
        nb_player++;
        commits[msg.sender] = keccak256(abi.encodePacked(input,key));
        commited[msg.sender] = true;
    }
    function Reveal(uint8 input,uint256 key) public {
        require((players[0] == msg.sender || players[1] == msg.sender),'Not a player');
        require(nb_player == 2,'waiting player');
        require(input == 0 || input == 1, 'need to input a bit');

        bytes32 rev = keccak256(abi.encodePacked(input,key));
        require(rev == commits[msg.sender],'Commitment does not match');
        bits[msg.sender] = input;
        revealed[msg.sender] = true;  
        if (revealed[players[0]] && revealed[players[1]]){
            leader = players[bits[players[0]] ^ bits[players[1]]];
            time_leader = block.timestamp;
            emit leader_elected();
        }
    }
    function get_leader() public view returns (address){
        return leader;
    }
    function reset() internal {
        for (uint8 i=0 ; i<2;i++){
            commited[players[i]] = false;
            revealed[players[i]] = false;
            players[i] = address(0);
        }
        leader = address(0);
        nb_player = 0;
        time_commit = 0;
        time_leader = 0;
        emit reset_done();
    }

    function election_reset() public{
        if (leader == msg.sender){
            reset();
        }
        else if (leader == address(0)){
            require(time_commit != 0 && block.timestamp - time_commit > 5 minutes,'election not over');
            reset();
        }
        else if (leader != address(0)){
            require(block.timestamp - time_leader > 3 minutes,'leader not finished');
            reset();
        }

    }

}
