const { fetch } = require('undici')
const mc = require('minecraft-protocol')
const { webhook_url, summary_webhook_url, honeypot_ip, ip_names, blacklist, summary_message_id } = require('./config.json')
const CONFIG = require('./config.json')
const fs = require('fs')
const P0fClient = require('./p0f-client')

const server = mc.createServer({
	'online-mode': false,
	encryption: true,
	host: '0.0.0.0',
	port: CONFIG.port || 25565,
	version: '1.18.2',
	beforePing: makePingResponse,
	motd: 'Dream recording server'
	// validateChannelProtocol: false
})

let p0f
startP0f()

async function startP0f() {
	p0f = new P0fClient('/tmp/p0f-socket')
	await p0f.connect()
	p0f._socket.on('end', () => startP0f() )
}

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

		let p0fResponse
		try {
			p0fResponse = await p0f.query(ip)
		} catch (e) {
			console.error(e)
			p0fResponse = null
		}
		console.log(p0fResponse)

		let message = ''
		if (previousJoins === 0)
			message += '**first join!** '
		message += `Login from ${prettyIpMarkdown(ip)}`

		const parts = []
		if (ipName)
			parts.push(ipName)
		// the vpn, isp, or host
		const hostingName = ips[ip]?.org ?? await getHostingName(ip)
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
		if (logoutTime) {
			const leftAfterMilliseconds = Math.round(logoutTime - loginTime)
			if (leftAfterMilliseconds > 2000)
				message += `\nLeft after: ${Math.round(leftAfterMilliseconds / 1000)}s`
			else
				message += `\nLeft after: ${leftAfterMilliseconds}ms`
		}
		if (p0fResponse) {
			let fingerprint = p0fResponse.osName ? `${p0fResponse.osName}` : 'Unknown OS'
			if (p0fResponse.osFlavor)
				fingerprint += ` ${p0fResponse.osFlavor}`
			if (p0fResponse.linkType)
				fingerprint += `, link type: ${p0fResponse.linkType}`
			if (p0fResponse.uptimeMin) {
				fingerprint += `, uptime ${prettyMinutes(p0fResponse.uptimeMin)}`
				if (p0fResponse.upModDays) fingerprint += ` % ${p0fResponse.upModDays} days`
			}
			message += `\nFingerprint: ${fingerprint}`
		}
		addIpJoinToFile(ip, hostingName)
		log(message)
		updateSummary()
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

	if (blacklist.includes(ip) || (
		clientTargetHost === 'mat' && ip !== CONFIG.honeypot_ip
	)) {
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

	let p0fResponse
	try {
		p0fResponse = await p0f.query(ip)
	} catch (e) {
		console.error(e)
		p0fResponse = null
	}
	console.log(p0fResponse)


	const ipName = ip_names[ip]
	const previousHits = ips[ip]?.hits || 0
	const lastHit = ips[ip]?.lastHit


	let message = ''
	if (previousHits === 0)
		message += '**first ping!** '
	message += `Ping from ${prettyIpMarkdown(ip)} `
	message += '('
	if (ipName)
		message += `${ipName}, `

	// the vpn, isp, or host
	const hostingName = ips[ip]?.org ?? await getHostingName(ip)
	if (hostingName)
		message += `${hostingName}, `

	message += `protocol: v${clientProtocol}`
	if (clientTargetHost != honeypot_ip)
		message += `, target: ${clientTargetHost}:${clientTargetPort}`
	if (p0fResponse) {
		let fingerprint = p0fResponse.osName ? `${p0fResponse.osName}` : 'Unknown OS'
		if (p0fResponse.osFlavor)
			fingerprint += ` ${p0fResponse.osFlavor}`
		if (p0fResponse.linkType)
			fingerprint += `, link type: ${p0fResponse.linkType}`
		if (p0fResponse.uptimeMin) {
			fingerprint += `, uptime ${prettyMinutes(p0fResponse.uptimeMin)}`
			if (p0fResponse.upModDays) fingerprint += ` % ${p0fResponse.upModDays} days`
		}
		message += `, fingerprint: ${fingerprint}`
	}
	if (previousHits > 0)
		message += ', #' + (previousHits + 1)
	message += ')'
	log(message)
	addIpPingToFile(ip, hostingName)
	updateSummary()

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
	await fs.promises.writeFile('ips.json.save', JSON.stringify(ips, null, 2))
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

async function updateSummary() {
	const sortedIps = Object.entries(ips)
		.filter(r => !blacklist.includes(r[0]))
		.sort((a, b) => (Math.max(a[1].lastHit || null, a[1].lastJoin || null) - Math.max(b[1].lastHit || null, b[1].lastJoin || null)))
	const summaryLines = []
	for (const [ip, data] of sortedIps.slice(sortedIps.length - 35)) {
		const ipName = ip_names[ip]
		const ipOrg = data.org

		let message = ''
		message += prettyIpMarkdown(ip)

		{
			const parts = []
			if (ipName)
				parts.push(ipName)
			if (ipOrg)
				parts.push(ipOrg)
			if (parts.length > 0)
				message += ` (${parts.join(', ')})`
		}

		{
			const parts = []
			if (data.lastHit)
				parts.push(`Last ping: <t:${Math.floor(data.lastHit / 1000)}:R>`)
			if (data.lastJoin)
				parts.push(`Last join: <t:${Math.floor(data.lastJoin / 1000)}:R>`)
			if (parts.length > 0)
				message += ` ${parts.join(', ')}`
		}

		summaryLines.push(message)
	}

	const description = summaryLines.join('\n')
	console.log('Editing,', description.length, 'chars')
	// handle ratelimits
	const r = await fetch(`${summary_webhook_url}/messages/${summary_message_id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			embeds: [
				{
					title: 'Summary',
					description,
					footer: {
						text: `${Object.keys(ips).length} unique IPs`
					}
				}]
		})
	})
	if (r.status === 429) {
		// if it was ratelimited, too bad, it'll get updated later
	}

}

updateSummary()

async function addIpPingToFile(ip, org) {
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
	if (org)
		ips[ip].org = org
	await updateIpsFile()
}
async function addIpJoinToFile(ip, org) {
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
	if (org)
		ips[ip].org = org
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
		let host = json.data.privacy.service || json.data.company.name || null
		if (host)
			host = host.split('-')[0].trim()
		return host
	} catch (e) {
		console.error(e)
		return null
	}
}

function prettyIpMarkdown(ip) {
	return `[\`${ip}\`](<https://ipinfo.io/${ip}>)`
}

function prettyMinutes(minutes) {
	if (minutes >= 1440) {
		return (minutes / 1440).toFixed(2) + ' days'
	} else {
		return minutes + ' minutes'
	}
}
