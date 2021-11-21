require('dotenv').config({
    path: 'C:/Users/tme/Documents/Projects/quotepad-server/test.env' //why do i have to write the path in full?
});

global.db = require("../db/main.js");
const Quote = require("../models/quote.js");

jest.setTimeout(30000);

const getQuote = text => {
    return new db.Quote({
        "text": text
    })
    .fetch({ withRelated: [ "authors", "title", "tags" ] })
    .then(quote => Promise.resolve(quote.toJSON()));
};

const getTitle = id => {
    return new db.Title({
        "id": id
    })
    .fetch({ withRelated: "authors" })
    .then(title => Promise.resolve(title.toJSON()));
}

const checkElemsMatchWithIds = elems => {
    //each elem looks like { id: X, value: "New YYY Z"}, and X should equal Z
    /*return elems.reduce((works, current) => {
        return works && parseInt(current.value.split(" ")[2]) == current.id;
    }, true);*/
    for(let i = 0; i < elems.length; i++)
        expect(elems[i].id).toBe(parseInt(elems[i].value.split(" ")[2]));
};

beforeAll(() => {
    return knex.raw(`
        DROP TABLE quote_tags;
        DROP TABLE quote_authors;
        DROP TABLE title_authors;
        DROP TABLE tags;
        DROP TABLE quotes;
        DROP TABLE titles;
        DROP TABLE title_types;
        DROP TABLE authors;

        CREATE TABLE title_types (
            id SERIAL PRIMARY KEY,
            value varchar(100) NOT NULL
        );
        
        CREATE TABLE tags (
            id SERIAL PRIMARY KEY,
            value varchar(255) NOT NULL
        );
        
        CREATE TABLE titles (
            id SERIAL PRIMARY KEY,
            value varchar(512) NOT NULL,
            type_id integer REFERENCES title_types(id),
            url varchar(1023)
        );
        
        CREATE TABLE authors (
            id SERIAL PRIMARY KEY,
            value varchar(255) NOT NULL
        );
        
        CREATE TABLE quotes (
            id SERIAL PRIMARY KEY,
            text varchar(4095) NOT NULL,
            title_id integer REFERENCES titles(id),
            is_favourite boolean DEFAULT false,
            date_added timestamp
        );
        
        CREATE TABLE quote_tags (
            quote_id integer NOT NULL REFERENCES quotes(id),
            tag_id integer NOT NULL REFERENCES tags(id),
            PRIMARY KEY(quote_id, tag_id)
        );
        
        CREATE TABLE title_authors (
            title_id integer NOT NULL REFERENCES titles(id),
            author_id integer NOT NULL REFERENCES authors(id),
            PRIMARY KEY(title_id, author_id)
        );
        
        CREATE TABLE quote_authors (
            quote_id integer NOT NULL REFERENCES quotes(id),
            author_id integer NOT NULL REFERENCES authors(id),
            PRIMARY KEY(quote_id, author_id)
        );
        
        INSERT INTO title_types(value) VALUES
            ('Book'),
            ('Video'),
            ('Song'),
            ('Article'),
            ('Movie'),
            ('Poem');
    `);
})

it("Creates a quote with a new title, new authors and a new tag", () => {
    
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

    return Quote.createQuote(details)
    .then(() => {
        return getQuote("Test quote 1");
    })
    .then(newQuote => {
        expect(newQuote.id).toBe(1);
        expect(newQuote.title_id).toBe(1);
        expect(newQuote.authors.length).toBe(0);
        expect(newQuote.tags.length).toBe(1);
        checkElemsMatchWithIds(newQuote.tags);

        return getTitle(newQuote.title.id);
    })
    .then(newTitle => {
        expect(newTitle.authors.length).toBe(3);
        checkElemsMatchWithIds(newTitle.authors);
    });
});

it("Creates a quote with a new title, existing authors and an existing tag", () => {
    let details = {
        "quote": {
            "text": "Test quote 2",
            "title_id": -1
        },
        "title": {
            "value": "New Title 2",
            "type_id": 1
        },
        "authors": [
            { "id": 1, "value": "New Author 1" },
            { "id": 3, "value": "New Author 3" }
        ],
        "tags": [
            { "id": 1, "value": "New Tag 1" }
        ]
    };

    return Quote.createQuote(details)
    .then(() => {
        return getQuote("Test quote 2")
    })
    .then(quote => {
        expect(quote.id).toBe(2);
        expect(quote.title_id).toBe(2);
        expect(quote.authors.length).toBe(0);
        expect(quote.tags.length).toBe(1);
        expect(quote.tags[0].id).toBe(1);
        checkElemsMatchWithIds(quote.tags);

        return getTitle(quote.title_id)
    })
    .then(title => {
        expect(title.authors.length).toBe(2);
        checkElemsMatchWithIds(title.authors);
    });
});

it("Creates a quote with a new title, no authors, and two tags (one new and one existing)", () => {
    let details = {
        "quote": {
            "text": "Test quote 3",
            "title_id": -1
        },
        "title": {
            "value": "New Title 3",
            "type_id": 1
        },
        "authors": [],
        "tags": [
            { "id": 1, "value": "New Tag 1" },
            { "id": -1, "value": "New Tag 2" }
        ]
    };

    return Quote.createQuote(details)
    .then(() => {
        return getQuote("Test quote 3");
    })
    .then(quote => {
        expect(quote.title_id).toBe(3);
        expect(quote.authors.length).toBe(0);
        expect(quote.tags.length).toBe(2);
        checkElemsMatchWithIds(quote.tags);

        return getTitle(quote.title_id);
    })
    .then(title => {
        expect(title.authors.length).toBe(0);
    });
});

it("Creates a quote with a new title, a m(ix of new and existing authors, and two new tags", () => {
    let details = {
        "quote": {
            "text": "Test quote 4",
            "title_id": -1
        },
        "title": {
            "value": "New Title 4",
            "type_id": 1
        },
        "authors": [
            { "id": 1, "value": "New Author 1" },
            { "id": -1, "value": "New Author 4" },
            { "id": -1, "value": "New Author 5" },
            { "id": -1, "value": "New Author 6" },
            { "id": -1, "value": "New Author 7" },
            { "id": 2, "value": "New Author 2" }
        ],
        "tags": [
            { "id": -1, "value": "New Tag 3" },
            { "id": -1, "value": "New Tag 4" }
        ]
    };

    return Quote.createQuote(details)
    .then(() => {
        return getQuote("Test quote 4");
    })
    .then(newQuote => {
        expect(newQuote.title_id).toBe(4);
        expect(newQuote.authors.length).toBe(0);
        expect(newQuote.tags.length).toBe(2);
        checkElemsMatchWithIds(newQuote.tags);
        
        return getTitle(newQuote.title_id);
    })
    .then(newTitle => {
        expect(newTitle.authors.length).toBe(6);
        checkElemsMatchWithIds(newTitle.authors);
    })
});

afterAll(() => {
    return knex.destroy();
});

