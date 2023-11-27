class VideoChatApp {
    #userListComponent;
    #remoteVideo;
    #localUserMediaStream;
    #rtcConns = [];

    constructor(config) {
        this.localVideo = config.localVideo;
        this.socket = config.socket;
        this.#remoteVideo = config.remoteVideo;
        this.#setUpUserListComponent(config.userListComponent);
        this.#addSocketListeners();
    }

    async start() {
        let localUserMediaStream = await window.navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        });
        this.localVideo.srcObject = localUserMediaStream;
        this.#localUserMediaStream = localUserMediaStream;
    }

    #createRtcConnection(remoteVideo, socketId) {
        let rtcConn = new RtcConnHandler();
        rtcConn.onTrack((stream) => {
            if (remoteVideo.srcObject !== stream) {
                remoteVideo.srcObject = stream;
                console.log('received remote stream');
            }
        });
        rtcConn.onIceCandidate((candidate) => {
            if (candidate) {
                this.socket.emit("ice-candidate", {candidate, to: socketId});
            }
        });
        rtcConn.addStream(this.#localUserMediaStream);
        this.#rtcConns.push(rtcConn);
        return rtcConn;
    }

    async #callUser(socketId) {
        let rtcConn = this.#createRtcConnection(this.#remoteVideo, socketId)
        const offer = await rtcConn.createOffer()
        console.log("call user", offer)
        this.socket.emit("call-user", {offer, to: socketId});
    }

    #setUpUserListComponent(userListComponent) {
        userListComponent.addEventListener(userListComponent.USER_CLICKED_EVENT, this.#callUser.bind(this));
        this.#userListComponent = userListComponent;
    }

    #addSocketListeners() {
        this.socket.on("call-made", this.#onCallMade.bind(this));
        this.socket.on("answer-made", async data => {
            console.log("answer made", data)
            try {
                await this.#rtcConns.forEach(c => c.setAnswer(data.answer));
            } catch (e) {
                console.log(e)
            }
        });
        this.socket.on("ice-candidate-post", async data => {
            for (let i = this.#rtcConns.length -1; i >= 0; i--) {
                try {
                    await this.#rtcConns[i].addIceCandidate(data.candidate)
                } catch (e) {
                    // Remove the connection if it fails
                    console.log("failed to add ice candidate -  removing connection",e)
                    this.#rtcConns.splice(i, 1)
                }
            }
        });

        this.socket.on("update-user-list", ({users}) => {
            this.#userListComponent.updateUserList(users);
        });
        this.socket.on("remove-user", ({socketId}) => {
            const elToRemove = document.getElementById(socketId);
            if (elToRemove) {
                elToRemove.remove();
            }
        });
    }

    async #onCallMade(data) {
        console.log("call made", data)
        let rtcConn = this.#createRtcConnection(this.#remoteVideo, data.socket)
        const answer = await rtcConn.createAnswer(data.offer)
        this.socket.emit("make-answer", {answer, to: data.socket});
    }
}

class UserListComponent {
    #parentContainer;
    #eventListeners = {};
    USER_CLICKED_EVENT = "userClicked";

    constructor(parentContainer) {
        this.#parentContainer = parentContainer;
    }

    addEventListener(event, callback) {
        this.#eventListeners[event] = callback;
    }

    updateUserList(socketIds) {
        socketIds.forEach(socketId => {
            const alreadyExistingUser = document.getElementById(socketId);
            if (!alreadyExistingUser) {
                const userContainerEl = this.#createUserItemContainer(socketId);
                this.#parentContainer.appendChild(userContainerEl);
            }
        });
    }

    #unselectUsersFromList() {
        const alreadySelectedUser = document.querySelectorAll(
            ".active-user.active-user--selected"
        );

        alreadySelectedUser.forEach(el => {
            el.setAttribute("class", "active-user");
        });
    }

    #createUserItemContainer(socketId) {
        const userContainerEl = document.createElement("div");
        userContainerEl.setAttribute("class", "active-user");
        userContainerEl.setAttribute("id", socketId);

        const usernameEl = document.createElement("p");
        usernameEl.setAttribute("class", "username");
        usernameEl.innerHTML = `User: ${socketId}`;

        userContainerEl.appendChild(usernameEl);

        userContainerEl.addEventListener("click", () => {
            this.#unselectUsersFromList();
            userContainerEl.setAttribute("class", "active-user active-user--selected");
            const talkingWithInfo = document.getElementById("talking-with-info");
            talkingWithInfo.innerHTML = `Talking with: "Socket: ${socketId}"`;
            this.#eventListeners[this.USER_CLICKED_EVENT](socketId);
        });
        return userContainerEl;
    }
}

let app = new VideoChatApp({
    localVideo: document.getElementById("local-video"),
    remoteVideo: document.getElementById("remote-video"),
    // remoteVideo: document.getElementById("remote-audio"), We can use this for audio as well
    userListComponent: new UserListComponent(document.getElementById("active-user-container")),
    socket: io.connect("localhost:881")
});
app.start();

