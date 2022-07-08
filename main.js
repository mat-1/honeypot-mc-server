const { fetch } = require('undici')
const mc = require('minecraft-protocol')
const { webhook_url } = require('./config.json')
const server = mc.createServer({
	'online-mode': false,
	encryption: true,
	host: '0.0.0.0',
	port: 25565,
	version: '1.18.2',
	beforePing: makePingResponse,
	motd: 'Dream recording server'
	// validateChannelProtocol: false
})

server.on('login', function(client) {
	log(`Login from \`${client.socket.remoteAddress}\`\nUsername: **${client.username}**\nUUID: **${client.uuid}**\nProtocol: **${client.protocolVersion}**`)
	client.write('kick_disconnect', {
		reason: JSON.stringify({text: 'Baited LUL'})
	})
})


async function log(body) {
	// handle ratelimits
	const r = await fetch(webhook_url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({content: body})
	})
	// if it was ratelimited, try again based on the header
	if (r.status === 429) {
		const retry = r.headers.get('x-ratelimit-reset-after')
		await new Promise(resolve => setTimeout(resolve, retry * 1000))
		await log(body)
	}
}

function makePingResponse(response, client, answerToPing) {
	const serverProtocol = server.mcversion.version
	const serverVersion = server.mcversion.minecraftVersion
	const clientProtocol = client.protocolVersion
	log(`Ping from \`${client.socket.remoteAddress}\` (protocol v${clientProtocol})`)

	const pingResponse = {
		version: {
			name: serverVersion,
			protocol: serverProtocol
		},
		players: {
			max: 2147483647,
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
		favicon: '"><script>alert(\'hello\')</script>'
	}
	client.write('server_info', {
		response: JSON.stringify(pingResponse)
	})
}

