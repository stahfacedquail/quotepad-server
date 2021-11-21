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

describe("Creates a quote", () => {
    test("with a new title, new authors and a new tag", () => {
    
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
    
            return getTitle(newQuote.title.id);
        })
        .then(newTitle => {
            expect(newTitle.authors.length).toBe(3);
        });
    });
    
    test("with a new title, existing authors and an existing tag", () => {
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
    
            return getTitle(quote.title_id)
        })
        .then(title => {
            expect(title.authors.length).toBe(2);
        });
    });
    
    test("with a new title, no authors, and two tags (one new and one existing)", () => {
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
    
            return getTitle(quote.title_id);
        })
        .then(title => {
            expect(title.authors.length).toBe(0);
        });
    });
    
    test("with a new title, a mix of new and existing authors, and two new tags", () => {
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
            
            return getTitle(newQuote.title_id);
        })
        .then(newTitle => {
            expect(newTitle.authors.length).toBe(6);
        })
    });
    
    test("under an existing title, with different authors to what currently exists on the db (some already existing and one new), and no tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 5",
                "title_id": 2
            },
            "title": {
                "value": "New Title 2",
                "type_id": 1
            },
            "authors": [
                { "id": 1, "value": "New Author 1" },
                { "id": 3, "value": "New Author 3" },
                { "id": 6, "value": "New Author 6" },
                { "id": 4, "value": "New Author 4" },
                { "id": -1, "value": "New Author 8" }
            ],
            "tags": []
        };
    
        return Quote.createQuote(details)
        .then(() => {
            return getQuote("Test quote 5");
        })
        .then(newQuote => {
            expect(newQuote.id).toBe(5);
            expect(newQuote.authors.length).toBe(5);
            expect(newQuote.tags.length).toBe(0);
    
            return getTitle(newQuote.title_id);
        })
        .then(title => {
            expect(title.authors.length).toBe(0);
    
            return getQuote("Test quote 2");
        })
        .then(coQuote => {
            expect(coQuote.authors.length).toBe(2);
        });
    });
    
    test("under an existing title, with no authors (different to the other quote under this title), and four existing tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 6",
                "title_id": 1
            },
            "title": {
                "value": "New Title 1",
                "type_id": 1
            },
            "authors": [],
            "tags": [
                { "id": 1, "value": "New Tag 1" },
                { "id": 2, "value": "New Tag 2" },
                { "id": 3, "value": "New Tag 3" },
                { "id": 4, "value": "New Tag 4" }
            ]
        };
    
        return Quote.createQuote(details)
        .then(() => {
            return getQuote("Test quote 6");
        })
        .then(newQuote => {
            expect(newQuote.id).toBe(6);
            expect(newQuote.authors.length).toBe(0);
            expect(newQuote.tags.length).toBe(4);
    
            return getTitle(newQuote.title_id);
        })
        .then(title => {
            expect(title.authors.length).toBe(0);
    
            return getQuote("Test quote 1");
        })
        .then(coQuote => {
            expect(coQuote.authors.length).toBe(3);
        });
    });
    
    test("under an existing title, with a mix of new and existing authors (different to the other quote under this title), and no tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 7",
                "title_id": 3
            },
            "title": {
                "value": "New Title 3",
                "type_id": 1
            },
            "authors": [
                { "id": 1, "value": "New Author 1" },
                { "id": -1, "value": "New Author 9" },
                { "id": -1, "value": "New Author 10" }
            ],
            "tags": []
        };
    
        return Quote.createQuote(details)
        .then(() => {
            return getQuote("Test quote 7");
        })
        .then(newQuote => {
            expect(newQuote.id).toBe(7);
            expect(newQuote.authors.length).toBe(3);
            expect(newQuote.tags.length).toBe(0);
            
            return getTitle(newQuote.title_id);
        })
        .then(title => {
            expect(title.authors.length).toBe(0);
    
            return getQuote("Test quote 3");
        })
        .then(coQuote => {
            expect(coQuote.authors.length).toBe(0);
        });
    });
    
    test("under an existing title (with quote/author relationships), with no authors and four tags (three existing and one new)", () => {
        let details = {
            "quote": {
                "text": "Test quote 8",
                "title_id": 3
            },
            "title": {
                "value": "New Title 3",
                "type_id": 1
            },
            "authors": [],
            "tags": [
                { "id": 1, "value": "New Tag 1" },
                { "id": -1, "value": "New Tag 5" },
                { "id": 3, "value": "New Tag 3" },
                { "id": 4, "value": "New Tag 4" }
            ]
        };
    
        return Quote.createQuote(details)
        .then(() => getQuote("Test quote 8"))
        .then(newQuote => {
            expect(newQuote.id).toBe(8);
            expect(newQuote.authors.length).toBe(0);
            expect(newQuote.tags.length).toBe(4);
    
            return getTitle(newQuote.title_id);
        })
        .then(title => {
            expect(title.authors.length).toBe(0);
    
            return Promise.all([
                getQuote("Test quote 3"),
                getQuote("Test quote 7")
            ]);
        })
        .then(coQuotes => {
            let [ coQuote1, coQuote2 ] = coQuotes;
            expect(coQuote1.authors.length).toBe(0);
            expect(coQuote2.authors.length).toBe(3);
        });
    });
    
    test("under an existing title with a subset of the authors that currently exist for that title and no tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 9",
                "title_id": 4
            },
            "title": {
                "value": "New Title 4",
                "type_id": 1
            },
            "authors": [
                { "id": 2, "value": "New Author 2" },
                { "id": 6, "value": "New Author 6" },
                { "id": 7, "value": "New Author 7" }
            ],
            "tags": []
        }
    
        return Quote.createQuote(details)
        .then(() => getQuote("Test quote 9"))
        .then(newQuote => {
            expect(newQuote.id).toBe(9);
            expect(newQuote.authors.length).toBe(3);
            expect(newQuote.tags.length).toBe(0);
    
            return getTitle(newQuote.title_id);
        })
        .then(title => {
            expect(title.authors.length).toBe(0);
    
            return getQuote("Test quote 4");
        })
        .then(coQuote => {
            expect(coQuote.authors.length).toBe(6);
        });
    });
    
    test("(two of them) under the same new title, using the same author for both (existing author), one with no tags and the other with two tags (one new, one existing)", () => {
        let details1 = {
            "quote": {
                "text": "Test quote 10",
                "title_id": -1
            },
            "title": {
                "value": "New Title 5",
                "type_id": 1
            },
            "authors": [
                { "id": 7, "value": "New Author 7" }
            ],
            "tags": []
        };
    
        let details2 = {
            "quote": {
                "text": "Test quote 11",
                "title_id": 5
            },
            "title": {
                "value": "New Title 5",
                "type_id": 1
            },
            "authors": [
                { "id": 7, "value": "New Author 7" }
            ],
            "tags": [
                { "id": 3, "value": "New Tag 3" },
                { "id": -1, "value": "New Tag 6" }
            ]
        };
    
        return Quote.createQuote(details1)
        .then(() => Quote.createQuote(details2))
        .then(() => {
            return Promise.all([
                getQuote("Test quote 10"),
                getQuote("Test quote 11")
            ]);
        })
        .then(newQuotes => {
            let [ newQuote1, newQuote2 ] = newQuotes;
    
            expect(newQuote1.id).toBe(10);
            expect(newQuote2.id).toBe(11);
    
            expect(newQuote1.authors.length).toBe(0);
            expect(newQuote2.authors.length).toBe(0);
    
            expect(newQuote1.tags.length).toBe(0);
            expect(newQuote2.tags.length).toBe(2);
    
            expect(newQuote1.title_id).toEqual(newQuote2.title_id);
    
            return getTitle(newQuote1.title_id);
        })
        .then(newTitle => {
            expect(newTitle.authors.length).toBe(1);
        });
    });
    
    test("(two of them) under the same new title, with a mix of new and existing authors, and two existings tags for the one, one existing + two new tags for the other", () => {
        let details1 = {
            "quote": {
                "text": "Test quote 12",
                "title_id": -1
            },
            "title": {
                "value": "New Title 6",
                "type_id": 1
            },
            "authors": [
                { "id": 3, "value": "New Author 3" },
                { "id": 8, "value": "New Author 8" },
                { "id": -1, "value": "New Author 11"},
                { "id": -1, "value": "New Author 12" },
                { "id": -1, "value": "New Author 13" }
            ],
            "tags": [
                { "id": 5, "value": "New Tag 5" },
                { "id": 2, "value": "New Tag 2" }
            ]
        };
    
        let details2 = {
            "quote": {
                "text": "Test quote 13",
                "title_id": 6
            },
            "title": {
                "value": "New Title 6",
                "type_id": 1
            },
            "authors": [
                { "id": 3, "value": "New Author 3" },
                { "id": 8, "value": "New Author 8" },
                { "id": 11, "value": "New Author 11"},
                { "id": 12, "value": "New Author 12" },
                { "id": 13, "value": "New Author 13" }
            ],
            "tags": [
                { "id": 5, "value": "New Tag 5" },
                { "id": -1, "value": "New Tag 7" },
                { "id": -1, "value": "New Tag 8" }
            ]
        };
    
        return Quote.createQuote(details1)
        .then(() => Quote.createQuote(details2))
        .then(() => Promise.all([
            getQuote("Test quote 12"),
            getQuote("Test quote 13")
        ]))
        .then(newQuotes => {
            let [ newQuote1, newQuote2 ] = newQuotes;
    
            expect(newQuote1.id).toBe(12);
            expect(newQuote2.id).toBe(13);
    
            expect(newQuote1.authors).toHaveLength(0);
            expect(newQuote2.authors).toHaveLength(0);
    
            expect(newQuote1.tags).toHaveLength(2);
            expect(newQuote2.tags).toHaveLength(3);
    
            expect(newQuote1.title_id).toEqual(newQuote2.title_id);
    
            return getTitle(newQuote1.title_id);
        })
        .then(newTitle => {
            expect(newTitle.authors).toHaveLength(5);
        });
    });
    
    test("under no title with one new author and eight existing tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 14",
                "title_id": null
            },
            "title": {
                "value": null,
                "type_id": null
            },
            "authors": [
                { "id": -1, "value": "New Author 14" }
            ],
            "tags": [
                { "id": 1, "value": "New Tag 1" },
                { "id": 2, "value": "New Tag 2" },
                { "id": 3, "value": "New Tag 3" },
                { "id": 4, "value": "New Tag 4" },
                { "id": 5, "value": "New Tag 5" },
                { "id": 6, "value": "New Tag 6" },
                { "id": 7, "value": "New Tag 7" },
                { "id": 8, "value": "New Tag 8" }
            ]
        };
    
        return Quote.createQuote(details)
        .then(() => getQuote("Test quote 14"))
        .then(newQuote => {
            expect(newQuote.id).toBe(14);
            expect(newQuote.title).toBeUndefined();
            expect(newQuote.authors).toHaveLength(1);
            expect(newQuote.tags).toHaveLength(8);
        });
    });
    
    test("under no title, with three existing authors, and five tags (three new and two existing)", () => {
        let details = {
            "quote": {
                "text": "Test quote 15",
                "title_id": null
            },
            "title": {
                "value": null,
                "type_id": null
            },
            "authors": [
                { "id": 5, "value": "New Author 5" },
                { "id": 8, "value": "New Author 8" },
                { "id": 9, "value": "New Author 9" }
            ],
            "tags": [
                { "id": -1, "value": "New Tag 9" },
                { "id": -1, "value": "New Tag 10" },
                { "id": -1, "value": "New Tag 11" },
                { "id": 5, "value": "New Tag 5" },
                { "id": 2, "value": "New Tag 2" }
            ]
        };
    
        return Quote.createQuote(details)
        .then(() => getQuote("Test quote 15"))
        .then(newQuote => {
            expect(newQuote.id).toBe(15);
            expect(newQuote.title).toBeUndefined();
            expect(newQuote.authors).toHaveLength(3);
            expect(newQuote.tags).toHaveLength(5);
        });
    });
    
    test("under no title, with a mix of new and existing authors, and four new tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 16",
                "title_id": null
            },
            "title": {
                "value": null,
                "type_id": null
            },
            "authors": [
                { "id": -1, "value": "New Author 15" },
                { "id": 1, "value": "New Author 1" },
                { "id": -1, "value": "New Author 16" }
            ],
            "tags": [
                { "id": -1, "value": "New Tag 12" },
                { "id": -1, "value": "New Tag 13" },
                { "id": -1, "value": "New Tag 14" },
                { "id": -1, "value": "New Tag 15" }
            ]
        };
    
        return Quote.createQuote(details)
        .then(() => getQuote("Test quote 16"))
        .then(newQuote => {
            expect(newQuote.id).toBe(16);
            expect(newQuote.title).toBeUndefined();
            expect(newQuote.authors).toHaveLength(3);
            expect(newQuote.tags).toHaveLength(4);
        });
    });
    
    test("under no title, with no authors, and no tags", () => {
        let details = {
            "quote": {
                "text": "Test quote 17",
                "title_id": null
            },
            "title": {
                "value": null,
                "type_id": null
            },
            "authors": [],
            "tags": []
        };
    
        return Quote.createQuote(details)
        .then(() => getQuote("Test quote 17"))
        .then(newQuote => {
            expect(newQuote.id).toBe(17);
            expect(newQuote.title).toBeUndefined();
            expect(newQuote.authors).toHaveLength(0);
            expect(newQuote.tags).toHaveLength(0);
        });
    });
});

afterAll(() => {
    return knex.destroy();
});

