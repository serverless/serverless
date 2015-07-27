'use strict';

var joseToDer = require('..').joseToDer;

var sigs = [
	['yA4WNemRpUreSh9qgMh_ePGqhgn328ghJ_HG7WOBKQV98eFNm3FIvweoiSzHvl49Z6YTdV4Up7NDD7UcZ-52cw', 'ES256'],
	['TsS1fXqgq5S2lpjO-Tz5w6ZAKqNFuQ6PufvXRN2NRY2DEsQ3iUXdEcAzcMXNqVehkZ-NwUxdIvDqwKTGLYQYVhjBxkdnwm1T5VKG2v1BYFeDQ91sgBlVhHFzvFty5wCI', 'ES384'],
	['AFKapY_5gq60n8NZ_C2iOQFov7sXgcMyDzCrnGsbvE7OlSBKbgj95aZ7GtdSdbw6joK2jjWJio8IgKNB9o11GdMTADfLUsv9oAJvmIApsmsPBAIe1vH8oeHYiDMBEz9OQcwS5eL-r1iO2v7oxzl9zZb1rA5kzBqS93ARCPKbjgcr602r', 'ES512']
];

module.exports.compare = {
	joseToDer: function () {
		for (var i = 0, n = sigs.length; i < n; ++i) {
			joseToDer.apply(null, sigs[i]);
		}
	}
};

module.exports.compareCount = 20;
module.exports.countPerLap = sigs.length;

require('bench').runMain();
