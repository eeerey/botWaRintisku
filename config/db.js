const knex = require('knex');

const db = knex({
    client: 'mysql2',
    connection: {
        host: '127.0.0.1',
        port: 3307,
        user: 'root',
        password: '', // Sesuaikan password database kamu
        database: 'rintisku_wa' // Sesuaikan nama database kamu
    }
});

module.exports = db;