const botSettings = require("./config.json");
const Discord = require("discord.js");
const axios = require("axios");
const yt = require("ytdl-core");
const YouTube = require("simple-youtube-api");
const fs = require("fs");
const getYTID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");
const prefix = botSettings.prefix;
const ytApiKey = botSettings.ytApiKey;
const youtube = new YouTube(ytApiKey);

const bot = new Discord.Client({
	disableEveryone: true
});

let commandsList = fs.readFileSync('commands.md', 'utf8');

/* MUSIC VARIABLES */
let queue = []; // Songs queue
let songsQueue = []; // Song names stored for queue command
let isPlaying = false; // Is music playing
let dispatcher = null;
let voiceChannel = null;
let skipRequest = 0; // Stores the number of skip requests 
let skippers = []; // Usernames of people who voted to skip the song
let ytResultList = []; // Video names results from yt command
let ytResultAdd = []; // For storing !add command choice
/* MUSIC VARIABLES END */
let re = /^(?:[1-5]|0[1-5]|10)$/; // RegEx for allowing only 1-5 while selecting song from yt results
let regVol = /^(?:([1][0-9][0-9])|200|([1-9][0-9])|([0-9]))$/; // RegEx for volume control
let youtubeSearched = false; // If youtube has been searched (for !add command)
let selectUser; // Selecting user from guild

bot.on("ready", async () => {
	bot.user.setStatus("dnd");
	
	console.log(`Bot is ready! ${bot.user.username}`);

	/*try {
		let link = await bot.generateInvite(["ADMINISTRATOR"]);
		console.log(link);
	} catch (e) {
		console.log(e.stack);
	}*/

});

bot.on("message", async message => {
	if (message.author.bot) return;
	if (message.channel.type === "dm") return;

	let messageContent = message.content.split(" ");
	let command = messageContent[0];
	let args = messageContent.slice(1);

	if (!command.startsWith(prefix)) return;

	switch (command.slice(1).toLowerCase()) {
		case "userinfo":
			if (args.length == 0) { // Displays the message author info if args are empty
				let embed = new Discord.RichEmbed()
					.setColor("#000000")
					.setDescription(`User info for: **${message.author.username}**`)
					.addField("Status:", message.author.presence.status, true)
					.addField("Bot: ", message.author.bot, true)
					.addField("In game: ", message.author.presence.game ? message.author.presence.game : "Not in game", true)
					.addField("Tag: ", message.author.tag, true)
					.addField("Discriminator:", message.author.discriminator, true)
					.addBlankField()
					.setFooter(`Profile created at: ${message.author.createdAt}`);

				message.channel.send(embed);
			} else { // Else displays info of user from args
				if (message.guild.available) {
					let selectUser = message.guild.member(message.mentions.users.first() || message.guild.members.get(args[0]));
					let embed = new Discord.RichEmbed()
						.setColor("#000000")
						.setDescription(`User info for: **${selectUser.user.username}**`)
						.addField("Status:", selectUser.user.presence.status, true)
						.addField("Bot: ", selectUser.user.bot, true)
						.addField("In game: ", selectUser.user.presence.game ? selectUser.user.presence.game : "Not in game", true)
						.addField("Tag: ", selectUser.user.tag, true)
						.addField("Discriminator:", selectUser.user.discriminator, true)
						.addBlankField()
						.setFooter(`Profile created at: ${selectUser.user.createdAt}`);

					message.channel.send(embed);
				}
			}
			break;

		case "play":
			if (args.length == 0 && queue.length > 0) {
				if (!message.member.voiceChannel) {
					message.reply("**يجب ان تكون بروم صوتي**");
				} else {
					isPlaying = true;
					playMusic(queue[0], message);
					message.reply(`now playing **${songsQueue[0]}**`);
				}
			} else if (args.length == 0 && queue.length == 0) {
				message.reply("**قائمة الانتظار فارغة، قم بتشغيل اي شيء**");
			} else if (queue.length > 0 || isPlaying) {
				getID(args).then(id => {
					if (id) {
						queue.push(id);
						getYouTubeResultsId(args, 1).then(ytResults => {
							message.reply(`added to queue **${ytResults[0]}**`);
							songsQueue.push(ytResults[0]);
						}).catch(error => console.log(error));
					} else {
						message.reply("**لا يمكن العثور عليها**");
					}
				}).catch(error => console.log(error));
			} else {
				isPlaying = true;
				getID(args).then(id => {
					if (id) {
						queue.push(id);
						playMusic(id, message);
						getYouTubeResultsId(args, 1).then(ytResults => {
							message.reply(`now playing **${ytResults[0]}**`);
							songsQueue.push(ytResults[0]);
						}).catch(error => console.log(error));
					} else {
						message.reply("**لا يمكن العثور عليها**");
					}
				}).catch(error => console.log(error));
			}
			break;

		case "skip":
			console.log(queue);
			if (queue.length === 1) {
				message.reply("**قائمة الانتظار فارغة، قم بتشغيل اي شيء**");
				dispatcher.end();
				setTimeout(() => voiceChannel.leave(), 1000);
			} else {
				if (skippers.indexOf(message.author.id) === -1) {
					skippers.push(message.author.id);
					skipRequest++;

					if (skipRequest >= Math.ceil((voiceChannel.members.size - 1) / 2)) {
						skipSong(message);
						message.reply("**تم اضافة التخطي الخاص بك الى القائمة**");
					} else {
						message.reply(`**تم اضافة التخطي الخاص بك الى القائمة**. انت تحتاج **${Math.ceil((voiceChannel.members.size - 1) / 2) - skipRequest}** اكثر لتخطي هذا المقطع`);
					}
				} else {
					message.reply("**انت بالفعل مصوت للتخطي**");
				}
			}
			break;

		case "queue":
			if (queue.length === 0) { // if there are no songs in the queue, send message that queue is empty
				message.reply("**قائمة الانتضار فارغة، قم بتشغيل اي شيء**");
			} else if (args.length > 0 && args[0] == 'remove') { // if arguments are provided and first one is remove
				if (args.length == 2 && args[1] <= queue.length) { // check if there are no more than 2 arguments and that second one is in range of songs number in queue
					// then remove selected song from the queue
					message.reply(`**${songsQueue[args[1] - 1]}** تم حذفها من القائمة .`);
					queue.splice(args[1] - 1, 1);
					songsQueue.splice(args[1] - 1, 1);
				} else { // if there are more than 2 arguments and the second one is not in the range of songs number in queue, send message
					message.reply(`تحتاج ادخال رقم المقطع في قائمة الانتظار الصالحة (1-${queue.length}).`);
				}
			} else if (args.length > 0 && args[0] == 'clear') { // same as remove, only clears queue if clear is first argument
				if (args.length == 1) {
					// reseting queue and songsQueue, but leaving current song
					message.reply("**تمت ازالة جميع المقاطع في قائمة الانتظار**");
					queue.splice(1);
					songsQueue.splice(1);
				} else {
					message.reply("تحتاج الى كتابة $queue واضح");
				}
			} else if (args.length > 0 && args[0] == 'shuffle') {
				let tempA = [songsQueue[0]];
				let tempB = songsQueue.slice(1);
				songsQueue = tempA.concat(shuffle(tempB));
				message.channel.send("تم تبديل قائمة الانتظار، اكتب $queue لمشاهدة قائمة الانتظار الجديده");
			} else { // if there are songs in the queue and queue commands is without arguments display current queue
				let format = "```"
				for (const songName in songsQueue) {
					if (songsQueue.hasOwnProperty(songName)) {
						let temp = `${parseInt(songName) + 1}: ${songsQueue[songName]} ${songName == 0 ? "**(المقطع الحالي)**" : ""}\n`;
						if ((format + temp).length <= 2000 - 3) {
							format += temp;
						} else {
							format += "```";
							message.channel.send(format);
							format = "```";
						}
					}
				}
				format += "```";
				message.channel.send(format);
			}
			break;

		case "repeat":
			if (isPlaying) {
				queue.splice(1, 0, queue[0]);
				songsQueue.splice(1, 0, songsQueue[0]);
				message.reply(`**${songsQueue[0]}** سوف يشتغل مرة اخرى`);
			}
			break;

		case "stop":
			dispatcher.end();
			setTimeout(() => voiceChannel.leave(), 1000);
			break;

		case "yt":
			if (args.length == 0) {
				message.reply("انت تحتاج الى كتابة عنوان البحث");
			} else {
				message.channel.send("```Searching youtube..```");
				getYouTubeResultsId(args, 5).then(ytResults => {
					ytResultAdd = ytResults;
					let ytEmbed = new Discord.RichEmbed()
						.setColor("#000000")
						.setAuthor("Youtube search results: ", icon_url = "https://cdn1.iconfinder.com/data/icons/logotypes/32/youtube-512.png")
						.addField("1:", "```" + ytResults[0] + "```")
						.addField("2:", "```" + ytResults[1] + "```")
						.addField("3:", "```" + ytResults[2] + "```")
						.addField("4:", "```" + ytResults[3] + "```")
						.addField("5:", "```" + ytResults[4] + "```")
						.addBlankField()
						.setFooter("اكتب !add لأضافه المقطع بقائمة الانتظار");
					message.channel.send(ytEmbed);
					youtubeSearched = true;
				}).catch(err => console.log(err));
			}
			break;

		case "add":
			if (youtubeSearched === true) {
				if (!re.test(args)) {
					message.reply("قمت بادخال رقم خاطئ، يرجى ادخال من 1-5 فقط");
				} else {
					let choice = ytResultAdd[args - 1];
					getID(choice).then(id => {
						if (id) {
							queue.push(id);
							getYouTubeResultsId(choice, 1).then(ytResults => {
								message.reply(`added to queue **${ytResults[0]}**`);
								songsQueue.push(ytResults[0]);
							}).catch(error => console.log(error));
						}
					}).catch(error => console.log(error));
					youtubeSearched = false;
				}
			} else {
				message.reply("يجب البحث باستخدام اليوتيوب لاضافة المقطع من القائمة");
			}
			break;

		case "vol":
			if (args.length == 0 && dispatcher) {
				message.reply(`الصوت الحالي : ${dispatcher.volume}. ،!vol [ 0-200 ]`);
			} else if (args.length > 0 && regVol.test(args) == true && dispatcher) {
				dispatcher.setVolume(args * 0.01);
				message.reply(`music volume has been set to ${args}%.`);
				console.log(dispatcher.volume);
			} else if (!regVol.test(args) && dispatcher) {
				message.reply("يجب ادخال رقم الصوت من 0-200");
			} else {
				message.reply("يمكنك فقط عند تشغيل اي مقطع");
			}
			break;

		case "help":
			message.channel.send("```cs\n" + commandsList + "\n```");
			break;

		case "commands":
			message.channel.send("```cs\n" + commandsList + "\n```");
			break;


	}
});

/*--------------------------------*/
/* MUSIC CONTROL FUNCTIONS START */
/*------------------------------*/
function playMusic(id, message) {
	voiceChannel = message.member.voiceChannel;

	voiceChannel.join()
		.then(connection => {
			console.log("Connected...");
			stream = yt(`https://www.youtube.com/watch?v=${id}`, {
				filter: 'audioonly'
			})

			skipRequest = 0;
			skippers = [];

			dispatcher = connection.playStream(stream);
			dispatcher.setVolume(0.25);
			dispatcher.on('end', () => {
				skipRequest = 0;
				skippers = [];
				queue.shift();
				songsQueue.shift();
				if (queue.length === 0) {
					console.log("Disconnected...");
					queue = [];
					songsQueue = [];
					isPlaying = false;
				} else {
					setTimeout(() => playMusic(queue[0], message), 500);
				}
			});
		})
		.catch(error => console.log(error));
}

async function getID(str) {
	if (str.indexOf("youtube.com") > -1) {
		return getYTID(str);
	} else {
		let body = await axios(`https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=${encodeURIComponent(str)}&key=${ytApiKey}`);
		if (body.data.items[0] === undefined) {
			return null;
		} else {
			return body.data.items[0].id.videoId;
		}
	}
}

function addToQueue(strID) {
	if (strID.indexOf("youtube.com")) {
		queue.push(getYTID(strID));
	} else {
		queue.push(strID);
		songsQueue.push(strID);
	}
}

function skipSong(message) {
	dispatcher.end();
}
/*------------------------------*/
/* MUSIC CONTROL FUNCTIONS END */
/*----------------------------*/

/*----------------------------------*/
/* YOUTUBE CONTROL FUNCTIONS START */
/*--------------------------------*/
async function searchYouTube(str) {
	let search = await axios(`https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=${encodeURIComponent(str)}&key=${ytApiKey}`);
	if (search.data.items[0] === undefined) {
		return null;
	} else {
		return search.data.items;
	}
}

async function getYouTubeResultsId(ytResult, numOfResults) {
	let resultsID = [];
	await youtube.searchVideos(ytResult, numOfResults)
		.then(results => {
			for (const resultId of results) {
				resultsID.push(resultId.title);
			}
		})
		.catch(err => console.log(err));
	return resultsID;
}
/*--------------------------------*/
/* YOUTUBE CONTROL FUNCTIONS END */
/*------------------------------*/

/*-----------------------*/
/* MISC FUNCTIONS START */
/*---------------------*/
function shuffle(queue) {
	for (let i = queue.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[queue[i], queue[j]] = [queue[j], queue[i]];
	}
	return queue;
}
/*---------------------*/
/* MISC FUNCTIONS END */
/*-------------------*/

client.login(process.env.BOT_TOKEN);
