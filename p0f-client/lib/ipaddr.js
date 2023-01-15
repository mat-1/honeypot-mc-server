'use strict';

const { Address6 } = require('ip-address')
const { Address4 } = require('ip-address')

module.exports = {
	parseIPv4( ipv4Address ) {
		const address = new Address4(ipv4Address)

		return address.toArray()
	},

	parseIPv6( ipv6Address ) {
		const address = new Address6(ipv6Address)

		return address.toUnsignedByteArray()
	}
};
