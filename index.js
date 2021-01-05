var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var availUsernames = ["Tortoise", "Baboon", "Raccoon", "Dingo", "Seahorse", "Badger", "Snail", "Parrot", "Wasp", "Toad", "Walrus", "Starfish",
    "Hippo", "Gorilla", "Vulture", "Cobra", "Beetle", "Flamingo", "Octopus", "Chameleon"];

var connectedUsers = {};
var chatMessages = [];

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket) {
    socket.on('disconnect', function() {
        connectedUsers[socket.username].sockets.splice(connectedUsers[socket.username].sockets.indexOf(socket), 1);
        if (connectedUsers[socket.username].sockets.length === 0) {
            if (connectedUsers[socket.username].isOriginalUsername) {
                availUsernames.push(socket.username);
            }
            delete connectedUsers[socket.username];
        }

        updateUsers();
        console.log("Disconnected... %s sockets connected", Object.keys(connectedUsers).length);
    });

    socket.emit("enter chat");

    socket.on('add user', function(data) {
        let usernameFromDefinedList = true;

        // If there was a saved user cookie and that user is not one of the current users in the chat, set the socket's username as the cookie user value
        if (data && caseInsensitiveArrSearch(Object.keys(connectedUsers), data) === -1) {
            socket.username = data;
            let idxUserCookie = caseInsensitiveArrSearch(availUsernames, data);

            // If the user cookie is one of the predefined (animal) usernames, remove that username from the selectable list
            if (idxUserCookie !== -1) {
                availUsernames.splice(idxUserCookie, 1);
            }
            // Else the user cookie is not one of the predefined (animal) usernames hence indicate as such as in a boolean property so that in the event of a
            // disconnect the custom username is not added to the predefined (animal) username list
            else {
                usernameFromDefinedList = false;
            }
        }
        // Else if there was no saved user cookie OR the saved username cookie value is already taken by a different user currently in the chat ...
        else {
            // Randomly pick (and afterwards remove) from the list of predefined (animal) usernames as the socket's username
            if (availUsernames.length > 0) {
                socket.username = availUsernames.splice(Math.floor(Math.random() * availUsernames.length), 1)[0];
            }
            // Else if the list of predefined (animal) usernames list is empty, generate a random username value - "User#N" where N is random 4-digit number
            else {
                let numeratedUserStr = generateRandNumeratedUser();
                while(caseInsensitiveArrSearch(Object.keys(connectedUsers), numeratedUserStr) !== -1) {
                    numeratedUserStr = generateRandNumeratedUser();
                }
                socket.username = numeratedUserStr;
                usernameFromDefinedList = false;
            }
        }

        // Create a key-value pair item to be added to the dictionary of connected users where the key is the username and the value is an object containing its
        // list of associated sockets, color (default white), and the boolean property indicating whether or not the username was taken from the predefined (animal)
        // usernames list
        connectedUsers[socket.username] = {sockets: [socket], color: "#ffffff", isOriginalUsername: usernameFromDefinedList};
        console.log("Connected... %s sockets connected", Object.keys(connectedUsers).length);

        socket.emit('new user', {user: socket.username, chatHistory: chatMessages, renderChatHistory: true});
        updateUsers();
    });

    socket.on('send message', function(data) {
        let isCommandMsg = false;
        let toAllClients = true;
        let outputMsg = data;

        // If the message begin with a "/" then it is considered to be a command
        if (data[0] === "/") {
            isCommandMsg = true;

            // Code that handles a nickname change command
            if (data.startsWith("/nick ")) {
                let newUsername = data.substring(6)

                // If the desired new nickname value is empty or has a length greater than 20 characters then inform the user that initiated the command (and only
                // that user) that this is invalid and to try again
                if (newUsername.length < 1 || newUsername.length > 20) {
                    outputMsg = "Invalid nickname value, please keep it to 1-20 characters.";
                    toAllClients = false;
                }
                // Else if the desired new nickname value is already taken then inform the user that initiated the command (and only that user) that this is invalid
                // and to try again
                else if (caseInsensitiveArrSearch(Object.keys(connectedUsers), newUsername) !== -1) {
                    outputMsg = "Desired nickname already taken, please try another.";
                    toAllClients = false;
                }
                // Otherwise, the desired new nickname is valid
                else {
                    // If the current/previous nickname was taken from the predefined (animal) usernames list, then push it back to the list to become available again
                    if (connectedUsers[socket.username].isOriginalUsername) {
                        availUsernames.push(socket.username);
                    }

                    // copy over the object value associated with the current username key into a new key that makes use of the desired new nickname; and afterwards
                    // delete the key-value pair item of the previous username
                    outputMsg = socket.username + " is now " + newUsername + ".";
                    connectedUsers[newUsername] = connectedUsers[socket.username];
                    delete connectedUsers[socket.username];

                    // set the socket's username property as the new desired username
                    socket.username = newUsername;
                    for (let sckt of connectedUsers[socket.username].sockets) {
                        sckt.username = newUsername;
                    }

                    // If the new desired username is one of the usernames in the predefined (animal) usernames list, remove that username from the list
                    let idx_new = caseInsensitiveArrSearch(availUsernames, socket.username);
                    if (idx_new !== -1) {
                        availUsernames.splice(idx_new, 1);
                    }
                    // Otherwise, set the boolean property indicating as such accordingly (i.e. to false)
                    else {
                        connectedUsers[socket.username].isOriginalUsername = false;
                    }

                    updateUsers();

                    // Emit "new user" only to those sockets that correspond to the user that initiated the nickname change command.
                    // P.S. This solution works but is not necessary and was done because initial implementation of the code attempted to make the chat work for multiple
                    // open tabs in the same browser which should be the same user, however found bugs related to having the chat open on multiple different browsers
                    // hence code was reverted to make the chat application work as intended as per the assignment specifications.
                    // Since multiple tabs of the same browser is not tested nor graded in the assignment, this solution was left in case developer wants to make the
                    // code work properly for such in the future
                    for (let sckt of connectedUsers[socket.username].sockets) {
                        io.to(sckt.id).emit('new user', {user: socket.username, renderChatHistory: false});
                    }
                }
            }
            // Code that handles a nickname color change command
            else if (data.startsWith("/nickcolor ")) {
                let colorStr = data.substring(11)

                // Do a regular expression test on the desired new color value to ensure it meets the proper format of a hex color code value
                let rgbRegex = new RegExp("^[a-fA-F0-9]{6}$");
                let rgbValTestPass = rgbRegex.test(colorStr);

                // If regular expression test passed, then change the color property associated with the (socket's) username key in the dictionary of connected users
                if (rgbValTestPass) {
                    outputMsg = "Nickname color changed from " + connectedUsers[socket.username].color + " to #" + colorStr + ".";
                    connectedUsers[socket.username].color = "#" + colorStr;
                }
                // Otherwise, inform the user that initiated the nickname color change command (and only that user) that their entered value is invalid and to try again
                else {
                    outputMsg = "Invalid (RRGGBB) hex color code value, please try again.";
                }
                toAllClients = false;
            }
            // Otherwise, if the user did not provide the change value for one of the above commands or is a different command, then inform the user that initiated
            // the command (and only that user) that such is invalid and to try again
            else {
                outputMsg = "Invalid command (format), please try again."
                toAllClients = false;
            }
        }

        let today = new Date();
        let msgToEmit = {msg: outputMsg, user: socket.username, datestamp: today.toLocaleDateString(), timestamp: today.toLocaleTimeString(), commandMsg: isCommandMsg,
            usernameColor: connectedUsers[socket.username].color};

        // If the message is to be sent to all clients then ensure that only the last 200 messages are saved in the chat history
        if (toAllClients) {
            if (chatMessages.length >= 200) {
                chatMessages.pop();
            }
            chatMessages.push(msgToEmit);

            io.sockets.emit('new message', msgToEmit);
        }
        else {
            socket.emit('new message', msgToEmit);
        }
    });

    function updateUsers() {
        io.sockets.emit('get users', Object.keys(connectedUsers));
    }
});

function generateRandNumeratedUser()  {
    let fourDigitRand = Math.floor(1000 + Math.random() * 9000);
    return "User#" + fourDigitRand;
}

function caseInsensitiveArrSearch(array, query) {
    return array.findIndex(item => query.toLowerCase() === item.toLowerCase());
}

http.listen(3000, function() {
    console.log('listening on *:3000');
});