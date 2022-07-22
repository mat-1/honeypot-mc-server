const { fetch } = require('undici')
const mc = require('minecraft-protocol')
const { webhook_url, honeypot_ip, ip_names, blacklist } = require('./config.json')
const fs = require('fs')
const server = mc.createServer({
	'online-mode': false,
	encryption: true,
	host: '0.0.0.0',
	port: 25565,
	version: '1.18.2',
	beforePing: makePingResponse,
	motd: 'Dream private recording server'
	// validateChannelProtocol: false
})

server.on('login', function (client) {
	const mcData = require('minecraft-data')(server.version)
	const loginPacket = mcData.loginPacket

	const ip = client.socket.remoteAddress

	if (blacklist.includes(ip)) {
		client.write('kick_disconnect', {
			reason: JSON.stringify({ text: 'Contact @mat#1592 on Discord for more information.' })
		})
		return
	}

	const ipName = ip_names[ip]
	const previousJoins = ips[ip]?.joins || 0
	const lastJoin = ips[ip]?.lastJoin

	addIpJoinToFile(ip)

	client.write('login', {
		entityId: client.id,
		isHardcore: false,
		gameMode: 0,
		previousGameMode: 1,
		worldNames: loginPacket.worldNames,
		dimensionCodec: loginPacket.dimensionCodec,
		dimension: loginPacket.dimension,
		worldName: 'minecraft:overworld',
		hashedSeed: [0, 0],
		maxPlayers: server.maxPlayers,
		viewDistance: 10,
		reducedDebugInfo: false,
		enableRespawnScreen: true,
		isDebug: false,
		isFlat: false
	})
	client.write('position', {
		x: 0,
		y: 64,
		z: 0,
		yaw: 0,
		pitch: 0,
		flags: 0x00
	})

	let brand = null
	let locale = null
	let physics = false
	let correctPhysics = false
	let messages = []

	const loginTime = Date.now()
	let logoutTime = null

	setTimeout(async () => {
		client.write('kick_disconnect', {
			reason: JSON.stringify({ text: 'Baited LUL https://discord.gg/5CKngMU6cZ' })
		})

		let message = ''
		if (previousJoins === 0)
			message += '**first join!** '
		message += `Login from [\`${ip}\`](<https://ipinfo.io/${ip}>)`

		const parts = []
		if (ipName)
			parts.push(ipName)
		// the vpn, isp, or host
		const hostingName = await getHostingName(ip)
		if (hostingName)
			parts.push(hostingName)
		if (parts.length > 0)
			message += ` (${parts.join(', ')})`

		message += `\nUsername: **${client.username}**`
		message += `\nUUID: **${client.uuid}**`
		message += `\nProtocol: v${client.protocolVersion}`
		if (brand !== 'vanilla')
			message += `\nBrand: ${brand}`
		if (locale !== 'en_us')
			message += `\nLocale: ${locale}`
		if (!correctPhysics)
			if (physics)
				message += `\nPhysics: Incorrect`
			else
				message += `\nPhysics: None`
		if (messages.length > 0)
			if (messages.length === 1)
				message += `\nMessage: ${messages[0].replace(/\n/g, ' ')}`
			else
				message += `\nMessages: ${messages.join(', ').replace(/\n/g, ' ')}`
		if (logoutTime)
			message += `\nLeft after: ${Math.round((logoutTime - loginTime) / 1000)}s`
		log(message)
	}, 15 * 1000)

	const brandChannel = 'minecraft:brand'
	client.registerChannel(brandChannel, ['string', []])
	client.on(brandChannel, d => {
		brand = d
	})
	client.on('position', p => {
		if (p.y !== 64)
			physics = true
		if (p.y === 63.92159999847412)
			correctPhysics = true
	})
	client.on('chat', msg => {
		messages.push(msg.message)
	})
	client.on('settings', s => {
		// there's other stuff but locale is the most interesting imo
		// {
		// 	locale: 'en_us',
		// 	viewDistance: 12,
		// 	chatFlags: 0,
		// 	chatColors: true,
		// 	skinParts: 127,
		// 	mainHand: 1,
		// 	enableTextFiltering: true,
		// 	enableServerListing: true
		// }
		locale = s.locale
	})
	client.on('end', (r) => {
		console.log(r)
		logoutTime = Date.now()
	})
})

const ips = JSON.parse(fs.readFileSync('ips.json', 'utf8'))

async function makePingResponse(response, client, answerToPing) {
	const serverProtocol = server.mcversion.version
	const serverVersion = server.mcversion.minecraftVersion
	const clientProtocol = client.protocolVersion
	const clientTargetHost = client.serverHost
	const clientTargetPort = client.serverPort
	const ip = client.socket.remoteAddress

	if (blacklist.includes(ip)) {
		const pingResponse = {
			version: {
				name: 'mat#1592',
				protocol: -1
			},
			players: {
				max: 0,
				online: 0,
			},
			description: {
				text: 'This is a honeypot to find scanners. If you see this, please remove the server from your server list.'
			},
		}
		client.write('server_info', {
			response: JSON.stringify(pingResponse)
		})
		return
	}


	const ipName = ip_names[ip]
	const previousHits = ips[ip]?.hits || 0
	const lastHit = ips[ip]?.lastHit


	let message = ''
	if (previousHits === 0)
		message += '**first ping!** '
	message += `Ping from [\`${ip}\`](<https://ipinfo.io/${ip}>) `
	message += '('
	if (ipName)
		message += `${ipName}, `

	// the vpn, isp, or host
	const hostingName = await getHostingName(ip)
	if (hostingName)
		message += `${hostingName}, `

	message += `protocol: v${clientProtocol}`
	if (clientTargetHost != honeypot_ip)
		message += `, target: ${clientTargetHost}:${clientTargetPort}`
	if (previousHits > 0)
		message += ', #' + (previousHits + 1)
	message += ')'
	log(message)
	addIpPingToFile(ip)

	const pingResponse = {
		version: {
			name: 'Paper ' + serverVersion,
			protocol: serverProtocol
		},
		players: {
			max: 32,
			online: 4,
			sample: [
				{
					name: 'Dream',
					id: 'ec70bcaf-702f-4bb8-b48d-276fa52a780c'
				},
				{
					name: 'Notch',
					id: '069a79f4-44e9-4726-a5be-fca90e38aaf5'
				},
				{
					name: 'Grian',
					id: '5f8eb73b-25be-4c5a-a50f-d27d65e30ca0'
				},
				{
					name: 'MumboJumbo',
					id: 'c7da90d5-6a05-4217-b94a-7d427cbbcad8'
				}
			]
		},
		description: {
			text: 'Dream recording server'
		},
		// favicon: '"><script>alert(\'hello\')</script>'
	}
	client.write('server_info', {
		response: JSON.stringify(pingResponse)
	})
}

async function updateIpsFile() {
	await fs.promises.writeFile('ips.json', JSON.stringify(ips, null, 2))
}
async function log(body) {
	console.log(body)
	// handle ratelimits
	const r = await fetch(webhook_url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ content: body.replace(/@/g, '@ ') }) // no @everyone abuse :)
	})
	// if it was ratelimited, try again based on the header
	if (r.status === 429) {
		console.log('Ratelimited, trying again')
		const retry = r.headers.get('x-ratelimit-reset-after')
		await new Promise(resolve => setTimeout(resolve, retry * 1000))
		await log(body)
	}
}


async function addIpPingToFile(ip) {
	if (!ips[ip]) {
		ips[ip] = {
			hits: 0,
			joins: 0,
			lastHit: null,
			lastJoin: null
		}
	}
	ips[ip].hits = ips[ip].hits + 1
	ips[ip].lastHit = Date.now()
	await updateIpsFile()
}
async function addIpJoinToFile(ip) {
	if (!ips[ip]) {
		ips[ip] = {
			hits: 0,
			joins: 0,
			lastHit: null,
			lastJoin: null
		}
	}
	ips[ip].joins = ips[ip].joins + 1
	ips[ip].lastJoin = Date.now()
	await updateIpsFile()
}

async function getHostingName(ip) {
	try {
		const r = await fetch(`https://ipinfo.io/widget/demo/${ip}`, {
			headers: {
				Referer: 'https://ipinfo.io/'
			}
		})
		const json = await r.json()
		console.log(json)
		return json.data.privacy.service || json.data.company.name || null
	} catch (e) {
		console.error(e)
		return null
	}
}