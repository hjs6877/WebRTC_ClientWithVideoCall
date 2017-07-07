/**
 * Created by kjs on 2017-07-03.
 */
var call_token;         // 통화를 위한 고유 토큰
var signaling_server;   // 시그널링 서버
var peer_connection;    // peer connection object

function start(){
    peer_connection = new rtc_peer_connection({
        "iceServers": [                         // ice Server 정보
            {"url": "stun:" + stun_server}      // stun Server 정보
        ]
    });

    // 다른 peer에 ICE 후보를 전송하는 핸들러
    peer_connection.onicecandidate = function(ice_event){
        if(ice_event.candidate){
            signaling_server.send(JSON.stringify({
                type: "new_ice_candidate",
                candidate: ice_event.candidate
            }));
        }
    }

    peer_connection.onaddstream = function(event){
        connect_stream_to_src(event.stream, document.getElementById("remote_video"));
    }

    // 로컬 카메라 스트림 셋업
    setup_video();

    signaling_server = new WebSocket("ws://localhost:8080/ws");

    // caller를 위한 시그널링 처리
    if(document.location.hash === "" || document.location.hash === undefined){
        var token = Date.now() + "-" + Math.round(Math.random() * 10000);
        console.log("token: " + token);
        call_token = "#" + token;

        document.location.hash = token;

        signaling_server.onopen = function(){
            signaling_server.onmessage = caller_signal_handler;
        }

        /**
         * caller가 접속에 참여했음을 시그널 서버에 알린다.
         */
        signaling_server.send(JSON.stringify({
            token: call_token,
            type: "join"
        }))

        document.title = "You are the Caller";
        document.getElementById("loading_state").innerHTML = "Ready for a call...ask your friend to visit:<br/><br/>" + document.location;
    }else{      // callee를 위한 시그널링 처리
        call_token = document.location.hash;

        signaling_server.onopen = function(){
            signaling_server.onmessage = callee_signal_handler;
        }

        /**
         * callee가 시그널 서버에 접속했음을 caller에게 알린다.
         */
        signaling_server.send(JSON.stringify({
            token: call_token,
            type: "callee_arrived"
        }));

        document.title = "You are the Callee";
        document.getElementById("loading_state").innerHTML = "One moment please...connecting your call...";
    }


}

// handler to process new descriptions
function new_description_created(description) {
    peer_connection.setLocalDescription(
        description,
        function () {
            signaling_server.send(
                JSON.stringify({
                    token:call_token,
                    type:"new_description",
                    sdp:description
                })
            );
        },
        log_error
    );
}

function caller_signal_handler(event) {
    var signal = JSON.parse(event.data);
    if (signal.type === "callee_arrived") {
        peer_connection.createOffer(
            new_description_created,
            log_error
        );
    } else if (signal.type === "new_ice_candidate") {
        peer_connection.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
        );
    } else if (signal.type === "new_description") {
        peer_connection.setRemoteDescription(
            new rtc_session_description(signal.sdp),
            function () {
                if (peer_connection.remoteDescription.type == "answer") {
                    // extend with your own custom answer handling here
                }
            },
            log_error
        );
    } else {
        // extend with your own signal types here
    }
}

function callee_signal_handler(event) {
    var signal = JSON.parse(event.data);
    if (signal.type === "new_ice_candidate") {
        peer_connection.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
        );
    } else if (signal.type === "new_description") {
        peer_connection.setRemoteDescription(
            new rtc_session_description(signal.sdp),
            function () {
                if (peer_connection.remoteDescription.type == "offer") {
                    peer_connection.createAnswer(new_description_created, log_error);
                }
            },
            log_error
        );
    } else {
        // extend with your own signal types here
    }
}

function setup_video() {
    get_user_media(
        {
            "audio": true, // request access to local microphone
            "video": true  // request access to local camera
        },
        function (local_stream) { // success callback
            // display preview from the local camera & microphone using local <video> MediaElement
            connect_stream_to_src(local_stream, document.getElementById("local_video"));
            // add local camera stream to peer_connection ready to be sent to the remote peer
            peer_connection.addStream(local_stream);
        },
        log_error
    );
}

function log_error(error) {
    console.log(error);
}