'use strict';

var derToJose = require('..').derToJose;

var sigs = [
	['MEUCIQD0nDQE4uBS6JuklnyACfPQRB/LMEh5Stq6sAfp38k6ewIgHvhX59iuruBiFpVkg3dQKJ3+Wk29lJmXfxp6ciRdj+Q=', 'ES256'],
	['MGUCMADcY5icKo+sLF0YCh5eVzju55Elt3Dfu4geMMDnUlLNaEO8NiCFzCHeqMx7mW5GMwIxAI6sp8ihHjRJ0sn/WV6mZCxN6/5lEg1QZJ5eiUHYv2kBgmiJ/Yv1pnqqFY3gVDBp/g==', 'ES384'],
	['MIGHAkFgiYpVsYxx6XiQp2OXscRW/PrbEcoime/FftP+B7x4QVa+M3KZzXlfP66zKqjo7O3nwK2s8GbTftW8H4HwojzimwJCAYQNsozTpCo5nwIkBgelcfIQ0y/U/60TbNH1+rlKpFDCFs6Q1ro7R1tjtXoAUb9aPIOVyXGiSQX/+fcmmWs1rkJU', 'ES512']
];

module.exports.compare = {
	derToJose: function () {
		for (var i = 0, n = sigs.length; i < n; ++i) {
			derToJose.apply(null, sigs[i]);
		}
	}
};

module.exports.compareCount = 20;
module.exports.countPerLap = sigs.length;

require('bench').runMain();
