require('dotenv').config({
    path: 'C:/Users/tme/Documents/Projects/quotepad-server/test.env' //why do i have to write the path in full?
});

global.db = require("../db/main.js");
const Quote = require("../models/quote.js");

jest.setTimeout(30000);

it("creates a quote with a new title, new authors and a new tag", () => {
    const details = {
        "quote": {
            "text": "Test quote 1",
            "title_id": -1
        },
        "title": {
            "value": "New Title 1",
            "type_id": 1
        },
        "authors": [
            { "id": -1, "value": "New Author 1" },
            { "id": -1, "value": "New Author 2" },
            { "id": -1, "value": "New Author 3" }
        ],
        "tags": [
            { "id": -1, "value": "New Tag 1" }
        ]
    };

    return Quote.createQuote(details).then(() => {
        //check quote created
        //check title created
        //check authors created
        //check title/author r-ships created
        //check NO quote/author r-ships created
        //check tags created
        //check quote/tag r-ships created
        return new db.Quote({
            text: "Test quote 1"
        })
        .fetch({ withRelated: [ "title", "authors", "tags" ] })
        .then(newQuote => {
            expect(newQuote).toBeTruthy();

            //newQuote = newQuote.toJSON();
        })
        .catch(error => console.log(error));
    });
});

afterAll(() => {
    // Closing the DB connection allows Jest to exit successfully.
    return knex.destroy();
});

