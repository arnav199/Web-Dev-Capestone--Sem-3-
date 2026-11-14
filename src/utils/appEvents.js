const { EventEmitter } = require('events');

// Domain events keep business operations independent from their notification side effects.
module.exports = new EventEmitter();
