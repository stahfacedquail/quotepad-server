require('dotenv').config({
    path: '/Users/tami.maiwashe/Documents/projects/quotepad-server/test.env' //why do i have to write the path in full?
});

global.db = require("../db/main.js");
const Quote = require("../models/quote.js");

jest.setTimeout(30000);

const getQuote = text => {
    return new db.Quote({
        "text": text
    })
    .fetch({ withRelated: [ "authors", "title", "tags" ] })
    .then(quote => Promise.resolve(quote.toJSON()))
    .catch(err => Promise.resolve(null));
};

const getTitle = id => {
    return new db.Title({
        "id": id
    })
    .fetch({ withRelated: "authors" })
    .then(title => Promise.resolve(title.toJSON()));
}

const getElemIds = async (ElemClass, values) => {
    const getSqls = values.map(val => new ElemClass().where({ value: val }).fetch());
    
    return Promise.all(getSqls)
    .then(elems => {
        return elems.map(elem => elem.toJSON()).reduce((obj, currElem) => {
            obj[currElem.value] = currElem.id
            return obj;
        }, {});
    });
}

const countElems = (elemType, values, field = "value") => {
    switch(elemType) {
        case "Title": elemType = new db.Title();
            break;
        case "Author": elemType = new db.Author();
            break;
        case "Tag": elemType = new db.Tag();
            break;
        case "Quote": elemType = new db.Quote();
            break;
        case "TitleAuthor": elemType = new db.TitleAuthor();
            break;
        case "QuoteAuthor": elemType = new db.QuoteAuthor();
            break;
        case "QuoteTag": elemType = new db.QuoteTag();
    }

    
    let counter = elemType.query(qb => {
        if(Array.isArray(values))
            return qb.whereIn(field, values);
        else
            return qb.where({
                [field]: values
            });
    });
    
    return counter.count().then(count => Promise.resolve(parseInt(count)));
    //Be careful when using query builder as it will not parse numeric answers
    //Find a way to initiliase pg with defaults.parseInt8 set to true??
};

const resetDb = () => {
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
}

beforeAll(() => {
    return resetDb();
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

describe("Deletes a quote", () => {
    test("where quote-related associations must be removed, but title, author and tag entities remain because they are still associated with other quotes", async () => {
        await Quote.deleteQuote(1);

        let quoteExists = await countElems("Quote", 1, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", [ "New Author 1", "New Author 2", "New Author 3" ]);
        expect(numAuthorsRemaining).toBe(3);

        let numTitlesRemaining = await countElems("Title", [ "New Title 1" ]);
        expect(numTitlesRemaining).toBe(1);

        let numTagsRemaining = await countElems("Tag", [ "New Tag 1" ]);
        expect(numTagsRemaining).toBe(1);
    });

    test("where the deletion leaves a zombie title which must be cleaned up", async () => {
        await Quote.deleteQuote(6);

        let quoteExists = await countElems("Quote", 6, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", [ "New Author 1", "New Author 2", "New Author 3" ]);
        expect(numAuthorsRemaining).toBe(3); //While these authors authored New Title 1, they are still associated with other quotes so they should not disappear

        let numTitlesRemaining = await countElems("Title", [ "New Title 1" ]);
        expect(numTitlesRemaining).toBe(0);

        let numTagsRemaining = await countElems("Tag", [ "New Tag 1", "New Tag 2", "New Tag 3", "New Tag 4" ]);
        expect(numTagsRemaining).toBe(4);
    });

    test("where zombie authors and zombie tags must be cleaned up", async () => {
        await Quote.deleteQuote(16);

        let quoteExists = await countElems("Quote", 16, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", [ "New Author 1", "New Author 15", "New Author 16" ]);
        expect(numAuthorsRemaining).toBe(1); //New Author 1 is still associated with other quotes; the others should be removed

        let numTagsRemaining = await countElems("Tag", [ "New Tag 12", "New Tag 13", "New Tag 14", "New Tag 15" ]);
        expect(numTagsRemaining).toBe(0);
    });

    test("(two quotes) where a zombie title (and the title/author associations) must ultimately be removed", async () => {
        await Quote.deleteQuote(10);

        let quoteExists = await countElems("Quote", 10, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", "New Author 7");
        expect(numAuthorsRemaining).toBe(1);

        let numTitlesRemaining = await countElems("Title", "New Title 5");
        expect(numTitlesRemaining).toBe(1);

        let numTitleAuthorAssociations = await countElems("TitleAuthor", 5, "title_id");
        expect(numTitleAuthorAssociations).toBe(1);

        await Quote.deleteQuote(11);

        quoteExists = await countElems("Quote", 11, "id");
        expect(quoteExists).toBe(0);
        
        numAuthorsRemaining = await countElems("Author", "New Author 7");
        expect(numAuthorsRemaining).toBe(1);

        numTitlesRemaining = await countElems("Title", "New Title 5");
        expect(numTitlesRemaining).toBe(0);

        let numTagsRemaining = await countElems("Tag", [ "New Tag 3", "New Tag 6" ]);
        expect(numTagsRemaining).toBe(2);
    });

    test("(two quotes) where a zombie title (and title/author associations) and some zombie authors must be removed", async () => {
        await Quote.deleteQuote(12);

        let quoteExists = await countElems("Quote", 12, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", [3, 8, 11, 12, 13].map(i => `New Author ${i}`));
        expect(numAuthorsRemaining).toBe(5);

        let numTitlesRemaining = await countElems("Title", "New Title 6");
        expect(numTitlesRemaining).toBe(1);

        let numTitleAuthorAssociations = await countElems("TitleAuthor", 6, "title_id");
        expect(numTitleAuthorAssociations).toBe(5);

        let numTagsRemaining = await countElems("Tag", [ "New Tag 2", "New Tag 5" ]);
        expect(numTagsRemaining).toBe(2);

        await Quote.deleteQuote(13);

        quoteExists = await countElems("Quote", 13, "id");
        expect(quoteExists).toBe(0);
        
        numAuthorsRemaining = await countElems("Author", [3, 8, 11, 12, 13].map(i => `New Author ${i}`));
        expect(numAuthorsRemaining).toBe(2);

        numTitlesRemaining = await countElems("Title", "New Title 6");
        expect(numTitlesRemaining).toBe(0);

        numTagsRemaining = await countElems("Tag", [ "New Tag 7", "New Tag 5", "New Tag 8" ]);
        expect(numTagsRemaining).toBe(3);
    });

    test("where the quote is the only data stored about that quote", async () => {
        await Quote.deleteQuote(17);

        let quoteExists = await countElems("Quote", 17, "id");
        expect(quoteExists).toBe(0);
    });

    test("(two quotes) where a title must ultimately be deleted, as well as two zombie authors, and quote/author relationships must be coalesced into a title/author relationship", async () => {
        await Quote.deleteQuote(9);

        let quoteExists = await countElems("Quote", 9, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", [ "New Author 6", "New Author 2", "New Author 7" ]);
        expect(numAuthorsRemaining).toBe(3);

        let numTitlesRemaining = await countElems("Title", "New Title 4");
        expect(numTitlesRemaining).toBe(1);

        let numTitleAuthorAssociations = await countElems("TitleAuthor", 4, "title_id");
        expect(numTitleAuthorAssociations).toBe(6);

        let numQuoteAuthorAssociations = await countElems("QuoteAuthor", 4, "quote_id");
        expect(numQuoteAuthorAssociations).toBe(0);

        await Quote.deleteQuote(4);

        quoteExists = await countElems("Quote", 4, "id");
        expect(quoteExists).toBe(0);
        
        numAuthorsRemaining = await countElems("Author", [1, 2, 4, 5, 6, 7].map(i => `New Author ${i}`));
        expect(numAuthorsRemaining).toBe(4);

        numTitlesRemaining = await countElems("Title", "New Title 4");
        expect(numTitlesRemaining).toBe(0);

        let numTagsRemaining = await countElems("Tag", [ "New Tag 3", "New Tag 4" ]);
        expect(numTagsRemaining).toBe(2);
    });

    test("where a zombie author and some zombie tags must be removed", async () => {
        await Quote.deleteQuote(14);

        let quoteExists = await countElems("Quote", 14, "id");
        expect(quoteExists).toBe(0);
        
        let numAuthorsRemaining = await countElems("Author", "New Author 14");
        expect(numAuthorsRemaining).toBe(0);

        let numTagsRemaining = await countElems("Tag", [1, 2, 3, 4, 5, 6, 7, 8].map(i => `New Tag ${i}`));
        expect(numTagsRemaining).toBe(5);
    });

    test("where the quote to delete has authors attached to it but the remaining quotes in that title both have no authors (coalescing logic should not freak out)", async () => {
        await Quote.deleteQuote(7);

        let quoteExists = await countElems("Quote", 7, "id");
        expect(quoteExists).toBe(0);

        let numAuthorsRemaining = await countElems("Author", [ "New Author 5", "New Author 9", "New Author 10" ]);
        expect(numAuthorsRemaining).toBe(2);
    });

    test("where coalescing the quotes into a title/author relationship must initially not be allowed, and then allowed", async () => {
        const details1 = {
            "quote": {
                "text": "Test quote 18",
                "title_id": 2
            },
            "title": {
                "value": "New Title 2",
                "type_id": 1
            },
            "authors": [
                { "id": 1, "value": "New Author 1" },
                { "id": 3, "value": "New Author 3" },
                { "id": 4, "value": "New Author 4" },
                { "id": 6, "value": "New Author 6" },
                { "id": 8, "value": "New Author 8" }
            ],
            "tags": []
        };

        const details2 = {
            "quote": {
                "text": "Test quote 19",
                "title_id": 2
            },
            "title": {
                "value": "New Title 2",
                "type_id": 1
            },
            "authors": [
                { "id": 1, "value": "New Author 1" },
                { "id": 3, "value": "New Author 3" },
                { "id": 4, "value": "New Author 4" },
                { "id": 6, "value": "New Author 6" },
                { "id": 8, "value": "New Author 8" }
            ],
            "tags": []
        };

        await Quote.createQuote(details1);
        await Quote.createQuote(details2);

        await Quote.deleteQuote(19);

        let quoteExists = await countElems("Quote", 19, "id");
        expect(quoteExists).toBe(0);

        let numAuthorsRemaining = await countElems("Author", [1, 3, 4, 6, 8].map(i => `New Author ${i}`));
        expect(numAuthorsRemaining).toBe(5);

        let numTitlesRemaining = await countElems("Title", "New Title 2");
        expect(numTitlesRemaining).toBe(1);

        let numTitleAuthorRships = await countElems("TitleAuthor", 2, "title_id");
        expect(numTitleAuthorRships).toBe(0);

        let numQuoteAuthorRships = await countElems("QuoteAuthor", [ 2, 5, 18 ], "quote_id");
        expect(numQuoteAuthorRships).toBe(12);

        await Quote.deleteQuote(2);

        quoteExists = await countElems("Quote", 2, "id");
        expect(quoteExists).toBe(0);

        numAuthorsRemaining = await countElems("Author", [1, 3, 4, 6, 8].map(i => `New Author ${i}`));
        expect(numAuthorsRemaining).toBe(5);

        numTitlesRemaining = await countElems("Title", "New Title 2");
        expect(numTitlesRemaining).toBe(1);

        numTitleAuthorRships = await countElems("TitleAuthor", 2, "title_id");
        expect(numTitleAuthorRships).toBe(5);

        numQuoteAuthorRships = await countElems("QuoteAuthor", [ 5, 18 ], "quote_id");
        expect(numQuoteAuthorRships).toBe(0);
    });
});

describe("Updates a quote", () => {
    beforeAll(() => resetDb());

    test("by toggling between is_favourite statuses", async () => {
        const details = {
            "quote": {
                "text": "Test Quote 1",
                "title_id": null
            },
            "authors": [],
            "tags": [
                { "id": -1, "value": "New Tag 1" },
                { "id": -1, "value": "New Tag 2" },
                { "id": -1, "value": "New Tag 3" }
            ]
        };
    
        await Quote.createQuote(details);
        let newQuote = await getQuote("Test Quote 1");

        await Quote.updateIsFavourite(newQuote.id, true);

        newQuote = await getQuote("Test Quote 1");
        expect(newQuote.is_favourite).toBe(true);

        await Quote.updateIsFavourite(newQuote.id, false);

        newQuote = await getQuote("Test Quote 1");
        expect(newQuote.is_favourite).toBe(false);
    });

    test("by changing its text", async () => {
        const details = {
            "quote": {
                "text": "Test Quote 2",
                "title_id": null
            },
            "authors": [],
            "tags": [
                { "id": -1, "value": "New Tag 4" },
                { "id": -1, "value": "New Tag 5" },
            ]
        };

        await Quote.createQuote(details);
        let newQuote = await getQuote("Test Quote 2");
        
        await Quote.updateQuote(newQuote.id, {
            "text": "Test Quote 2A"
        });

        newQuote = await getQuote("Test Quote 2");
        expect(newQuote).toBeNull();

        newQuote = await getQuote("Test Quote 2A");
        expect(newQuote).toBeDefined();
    });

    describe("by changing its tags", () => {
        beforeAll(() => {
            return Quote.createQuote({
                "quote": {
                    text: "Test Quote 3",
                    title_id: null
                },
                "authors": [],
                "tags": []
            });
        });
    
        let id = -1;;
        let tagIds = {};
    
        test("adding a new tag", async () => {
            id = (await getQuote("Test Quote 3")).id;
    
            await Quote.updateQuote(id, {
                tags: [
                    { "id": -1, "value": "New Tag 6" }
                ]
            });
    
            let updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(1);
        });
    
        test("adding existing tags", async () => {
            tagIds = await getElemIds(db.Tag, [1, 2, 3, 4, 5, 6].map(num => `New Tag ${num}`));
    
            await Quote.updateQuote(id, {
                tags: [1, 3, 5, 6].map(num => ({
                    id: tagIds[`New Tag ${num}`],
                    value: `New Tag ${num}`
                }))
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(4);
        });
        
        test("remove some tags, but they do not become zombies", async () => {
            await Quote.updateQuote(id, {
                tags: [
                    { id: tagIds["New Tag 1"], value: "New Tag 1" },
                    { id: tagIds["New Tag 6"], value: "New Tag 6" }
                ]
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(2);
    
            const numOtherTags = await countElems("Tag", [ "New Tag 3", "New Tag 5" ]);
            expect(numOtherTags).toBe(2);
        });
    
        test("remove all the tags, and one of them becomes a zombie", async () => {
            await Quote.updateQuote(id, {
                tags: []
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(0);
    
            const numLivingTags = await countElems("Tag", [ 1, 3, 5 ].map(num => `New Tag ${num}`));
            expect(numLivingTags).toBe(3);
    
            const numZombieTags = await countElems("Tag", "New Tag 6");
            expect(numZombieTags).toBe(0);
        });
    
        test("add a mix of new and existing tags", async () => {
            await Quote.updateQuote(id, {
                tags: [ 7, 8, 9 ].map(num => ({
                    id: -1,
                    value: `New Tag ${num}`
                })).concat({
                    id: tagIds["New Tag 5"],
                    value: "New Tag 5"
                })
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(4);
        });
    
        test("replace all the tags with completely new tags, and create zombie tags in the process", async () => {
            await Quote.updateQuote(id, {
                tags: [ 10, 11, 12, 13 ].map(num => ({
                    id: -1,
                    value: `New Tag ${num}`
                }))
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(4);
    
            const numLivingTags = await countElems("Tag", "New Tag 5");
            expect(numLivingTags).toBe(1);
    
            const numZombieTags = await countElems("Tag", [ 7, 8, 9 ].map(num => `New Tag ${num}`));
            expect(numZombieTags).toBe(0);
        });
    
        test("replace some of the tags with a new tag, creating zombie tags in the process", async () => {
            tagIds = {
                ...tagIds,
                ...(await getElemIds(db.Tag, [ "New Tag 12", "New Tag 13" ]))
            };
    
            await Quote.updateQuote(id, {
                tags: [
                    { id: -1, value: "New Tag 14" },
                    { id: tagIds["New Tag 12"], value: "New Tag 12" },
                    { id: tagIds["New Tag 13"], value: "New Tag 13" },
                ]
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(3);
    
            const numZombieTags = await countElems("Tag", [ "New Tag 10", "New Tag 11" ]);
            expect(numZombieTags).toBe(0);
        });
    
        test("replace some of the tags with existing tags, creating zombie tags in the process", async () => {
            tagIds = {
                ...tagIds,
                ...(await getElemIds(db.Tag, [ "New Tag 14" ]))
            };
    
            await Quote.updateQuote(id, {
                tags: [ 3, 4, 12, 14 ].map(num => ({
                    id: tagIds[`New Tag ${num}`],
                    value: `New Tag ${num}`
                }))
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(4);
    
            const numZombieTags = await countElems("Tag", "New Tag 13");
            expect(numZombieTags).toBe(0);
        });
    
        test("replace all the tags with an existing tag, creating some zombie tags in the process", async () => {
            await Quote.updateQuote(id, {
                tags: [{
                    id: tagIds["New Tag 1"], value: "New Tag 1"
                }] 
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(1);
    
            const numLivingTags = await countElems("Tag", [ "New Tag 3", "New Tag 4" ]);
            expect(numLivingTags).toBe(2);
    
            const numZombieTags = await countElems("Tag", [ "New Tag 12", "New Tag 14" ]);
            expect(numZombieTags).toBe(0);
        });
    
        test("replace all the tags with a mix of new and existing tags, without creating any zombie tags", async () => {
            await Quote.updateQuote(id, {
                tags: [
                    { id: tagIds["New Tag 2"], value: "New Tag 2" },
                    { id: tagIds["New Tag 5"], value: "New Tag 5" },
                    { id: -1, value: "New Tag 15" }
                ] 
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(3);
    
            const numLivingTags = await countElems("Tag", "New Tag 1");
            expect(numLivingTags).toBe(1);
        });
    
        test("replace some of the tags with a mix of new and existing tags, without creating any zombie tags", async () => {
            tagIds = {
                ...tagIds,
                ...(await getElemIds(db.Tag, [ "New Tag 15" ]))
            };
    
            await Quote.updateQuote(id, {
                tags: [ 16, 17, 18 ].map(num => ({
                    id: -1, value: `New Tag ${num}`
                })).concat([4, 15].map(num => ({
                    id: tagIds[`New Tag ${num}`],
                    value: tagIds[`New Tag ${num}`]
                })))
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(5);
    
            const numLivingTags = await countElems("Tag", [ "New Tag 2", "New Tag 5" ]);
            expect(numLivingTags).toBe(2);
        });
    
        test("remove all tags again", async () => {
            tagIds = {
                ...tagIds,
                ...(await getElemIds(db.Tag, [ 16, 17, 18 ].map(num => `New Tag ${num}`)))
            };
    
            await Quote.updateQuote(id, {
                tags: []
            });
    
            const updatedQuote = await getQuote("Test Quote 3");
            expect(updatedQuote.tags).toHaveLength(0);
    
            const numLivingTags = await countElems("Tag", [ "New Tag 4" ]);
            expect(numLivingTags).toBe(1);
    
            const numZombieTags = await countElems("Tag", [ 15, 16, 17, 18 ].map(num => `New Tag ${num}`));
            expect(numZombieTags).toBe(0);
        });
    });
});

describe("Updates a quote by changing its title and/or authors", () => {
    beforeAll(() => resetDb());

    let authorIds = {};

    describe("where the title changes from null to something new", () => {
        test("and the authors are updated from nothing to all-new authors", async () => {
            const details = {
                quote: {
                    text: "Test Quote 1",
                    title_id: null
                },
                authors: [],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote("Test Quote 1");

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: "New Title 1",
                    type_id: 1
                },
                authors: [1, 2, 3].map(num => ({
                    id: -1, value: `New Author ${num}`
                }))
            });

            authorIds = {
                ...(await getElemIds(db.Author, [1, 2, 3].map(n => `New Author ${n}`)))
            };

            quote = await getQuote("Test Quote 1");

            expect(quote.title_id).not.toBeNull();

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe("New Title 1");
            expect(newTitle.type_id).toBe(1);
            expect(newTitle.authors).toHaveLength(3);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are added to by new authors", async () => {
            const quoteTxt = "Test Quote 2";
            const newTitleTxt = "New Title 2";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 2"], value: "New Author 2" },
                    { id: -1, value: "New Author 4" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 4" ]))
            };

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: [
                    { id: authorIds["New Author 2"], value: "New Author 2" },
                    { id: authorIds["New Author 4"], value: "New Author 4" },
                    { id: -1, value: "New Author 5" },
                    { id: -1, value: "New Author 6" }
                ]
            });

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 5", "New Author 6" ]))
            };

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(4);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors go from zero to one existing author", async () => {
            const quoteTxt = "Test Quote 3";
            const newTitleTxt = "New Title 3";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt,
                    type_id: 6
                },
                authors: [
                    { id: authorIds["New Author 3"], value: "New Author 3" }
                ]
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBe(6);
            expect(newTitle.authors).toHaveLength(1);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are updated to include another existing author", async () => {
            const quoteTxt = "Test Quote 4";
            const newTitleTxt = "New Title 4";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 1"], value: "New Author 1" },
                    { id: authorIds["New Author 3"], value: "New Author 3" },
                    { id: authorIds["New Author 6"], value: "New Author 6" },
                ],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: [
                    { id: authorIds["New Author 1"], value: "New Author 1" },
                    { id: authorIds["New Author 3"], value: "New Author 3" },
                    { id: authorIds["New Author 6"], value: "New Author 6" },
                    { id: authorIds["New Author 2"], value: "New Author 2" }
                ]
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(4);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are updated from nothing to a mix of existing and new authors", async () => {
            const quoteTxt = "Test Quote 5";
            const newTitleTxt = "New Title 5";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: [
                    { id: authorIds["New Author 3"], value: "New Author 3" },
                    { id: authorIds["New Author 4"], value: "New Author 4" },
                    { id: -1, value: "New Author 7" }
                ]
            });

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 7"]))
            };

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(3);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are updated with a mix of new and existing authors", async () => {
            const quoteTxt = "Test Quote 6";
            const newTitleTxt = "New Title 6";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 5"], value: "New Author 5" },
                    { id: authorIds["New Author 7"], value: "New Author 7" },
                    { id: -1, value: "New Author 8" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 8" ]))
            };

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt,
                    type_id: 2
                },
                authors: [
                    { id: authorIds["New Author 3"], value: "New Author 3" },
                    { id: authorIds["New Author 7"], value: "New Author 7" },
                    { id: authorIds["New Author 5"], value: "New Author 5" },
                    { id: authorIds["New Author 8"], value: "New Author 8" },
                    { id: -1, value: "New Author 9" },
                    { id: -1, value: "New Author 10" },
                    { id: -1, value: "New Author 11" },
                ]
            });

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 9", "New Author 10", "New Author 11" ]))
            };

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBe(2);
            expect(newTitle.authors).toHaveLength(7);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are all removed", async () => {
            const quoteTxt = "Test Quote 7";
            const newTitleTxt = "New Title 7";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 5"], value: "New Author 5" },
                    { id: authorIds["New Author 8"], value: "New Author 8" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: []
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(0);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors remain at zero", async () => {
            const quoteTxt = "Test Quote 8";
            const newTitleTxt = "New Title 8";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: []
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(0);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors remain the same", async () => {
            const quoteTxt = "Test Quote 9";
            const newTitleTxt = "New Title 9";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [1, 4, 5, 10].map(n => ({
                    id: authorIds[`New Author ${n}`], value: `New Author ${n}`
                })),
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt,
                    type_id: 3
                },
                authors: [1, 4, 5, 10].map(n => ({
                    id: authorIds[`New Author ${n}`], value: `New Author ${n}`
                }))
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBe(3);
            expect(newTitle.authors).toHaveLength(4);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are replaced by new authors", async () => {
            const quoteTxt = "Test Quote 10";
            const newTitleTxt = "New Title 10";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 6"], value: "New Author 6" },
                    { id: authorIds["New Author 7"], value: "New Author 7" },
                    { id: authorIds["New Author 8"], value: "New Author 8" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt,
                    type_id: 4
                },
                authors: [
                    { id: -1, value: "New Author 12" }
                ]
            });

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 12" ]))
            };

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBe(4);
            expect(newTitle.authors).toHaveLength(1);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors go from zero to a bunch of existing authors", async () => {
            const quoteTxt = "Test Quote 11";
            const newTitleTxt = "New Title 11";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: [
                    { id: authorIds["New Author 2"], value: "New Author 2" },
                    { id: authorIds["New Author 7"], value: "New Author 7" },
                    { id: authorIds["New Author 10"], value: "New Author 10" }
                ]
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(3);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are replaced by a mix of new and existing authors", async () => {
            const quoteTxt = "Test Quote 12";
            const newTitleTxt = "New Title 12";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 1"], value: "New Author 1" },
                    { id: authorIds["New Author 4"], value: "New Author 4" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: [
                    { id: authorIds["New Author 5"], value: "New Author 5" },
                    { id: authorIds["New Author 10"], value: "New Author 10" },
                    { id: -1, value: "New Author 13" },
                    { id: -1, value: "New Author 14" },
                    { id: -1, value: "New Author 15" }
                ]
            });

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 13", "New Author 14", "New Author 15" ]))
            };

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(5);

            expect(quote.authors).toHaveLength(0);
        });

        test("and the authors are reduced to a subset, and one zombie is produced as a result", async () => {
            const quoteTxt = "Test Quote 13";
            const newTitleTxt = "New Title 13";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 3"], value: "New Author 3" },
                    { id: authorIds["New Author 5"], value: "New Author 5" },
                    { id: authorIds["New Author 9"], value: "New Author 9" },
                    { id: -1, value: "New Author 16" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 16" ]))
            };

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt,
                    type_id: 5
                },
                authors: [
                    { id: authorIds["New Author 3"], value: "New Author 3" },
                    { id: authorIds["New Author 9"], value: "New Author 9" }
                ]
            });

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBe(5);
            expect(newTitle.authors).toHaveLength(2);

            expect(quote.authors).toHaveLength(0);

            const numZombieAuthors = await countElems("Author", "New Author 16");
            expect(numZombieAuthors).toBe(0);
        });

        test("and the authors are replaced by a subset and a mix of new and existing authors", async () => {
            const quoteTxt = "Test Quote 14";
            const newTitleTxt = "New Title 14";

            const details = {
                quote: {
                    text: quoteTxt,
                    title_id: null
                },
                authors: [
                    { id: authorIds["New Author 10"], value: "New Author 10" },
                    { id: authorIds["New Author 13"], value: "New Author 13" },
                    { id: authorIds["New Author 2"], value: "New Author 2" },
                    { id: authorIds["New Author 6"], value: "New Author 6" },
                    { id: -1, value: "New Author 17" },
                    { id: -1, value: "New Author 18" },
                    { id: -1, value: "New Author 19" }
                ],
                tags: []
            };

            await Quote.createQuote(details);

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 17", "New Author 18", "New Author 19" ]))
            };

            let quote = await getQuote(quoteTxt);

            await Quote.updateQuote(quote.id, {
                title_id: -1,
                title: {
                    value: newTitleTxt
                },
                authors: [
                    { id: authorIds["New Author 10"], value: "New Author 10" },
                    { id: authorIds["New Author 6"], value: "New Author 6" },
                    { id: authorIds["New Author 18"], value: "New Author 18" },
                    { id: authorIds["New Author 4"], value: "New Author 4" },
                    { id: -1, value: "New Author 20" }
                ]
            });

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 20" ]))
            };

            quote = await getQuote(quoteTxt);

            const newTitle = await getTitle(quote.title_id);
            expect(newTitle.value).toBe(newTitleTxt);
            expect(newTitle.type_id).toBeNull();
            expect(newTitle.authors).toHaveLength(5);

            expect(quote.authors).toHaveLength(0);
        });

        test("check that no authors were unduly removed at any point", async () => {
            let allAuthors = [];
            const TOTAL_NUM_AUTHORS = 20;
            for(let i = 1; i <= TOTAL_NUM_AUTHORS; i++)
                allAuthors.push(`New Author ${i}`);
            
            const numAuthors = await countElems("Author", allAuthors);
            expect(numAuthors).toBe(TOTAL_NUM_AUTHORS - 3); // -3 because in the last two tests three zombie authors are created
        });
    });

    describe.only("where the title changes from null to something existing", () => {
        let authorIds = {};

        test("and the title's quotes are currently unaligned (and thus continue to be unaligned after the update)", async () => {
            const titleTxt = "New Title 15";

            let quote1 = {
                quote: {
                    text: "Test Quote 15",
                    title_id: -1
                },
                title: {
                    value: titleTxt
                },
                authors: [],
                tags: []
            };

            await Quote.createQuote(quote1);

            quote1 = await getQuote("Test Quote 15");

            let quote2 = {
                quote: {
                    text: "Test Quote 16",
                    title_id: quote1.title_id
                },
                title: {
                    value: titleTxt
                },
                authors: [
                    { id: -1, value: "New Author 21" },
                    { id: -1, value: "New Author 22" }
                ],
                tags: []
            };

            let quote3 = {
                quote: {
                    text: "Test Quote 17",
                    title_id: quote1.title_id
                },
                title: {
                    value: titleTxt
                },
                authors: [
                    { id: -1, value: "New Author 21" }
                ],
                tags: []
            };

            let quote4 = {
                quote: {
                    text: "Test Quote 18",
                    title_id: null
                },
                authors: [],
                tags: []
            };

            await Promise.all([
                Quote.createQuote(quote2),
                Quote.createQuote(quote3),
                Quote.createQuote(quote4)
            ]);

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 21", "New Author 22" ]))
            };

            quote4 = await getQuote("Test Quote 18");

            await Quote.updateQuote(quote4.id, {
                title_id: quote1.title_id,
                authors: [
                    { id: authorIds["New Author 21"], value: "New Author 21" },
                    { id: authorIds["New Author 22"], value: "New Author 22" }
                ]
            });

            quote4 = await getQuote("Test Quote 18");

            expect(quote4.title.value).toBe(titleTxt);
            expect(quote4.authors).toHaveLength(2);
            
            let title = await getTitle(quote4.title_id);
            expect(title.authors).toHaveLength(0);

            let quote5 = {
                quote: {
                    text: "Test Quote 19",
                    title_id: null
                },
                authors: [
                    { id: -1, value: "New Author 23" }
                ],
                tags: []
            };

            await Quote.createQuote(quote5);

            authorIds = {
                ...authorIds,
                ...(await getElemIds(db.Author, [ "New Author 23" ]))
            };

            quote5 = await getQuote("Test Quote 19");

            await Quote.updateQuote(quote5.id, {
                title_id: quote1.title_id,
                authors: [
                    { id: authorIds["New Author 23"], value: "New Author 23" }
                ]
            });

            quote5 = await getQuote("Test Quote 19");

            expect(quote5.title.value).toBe(titleTxt);
            expect(quote5.authors).toHaveLength(1);
            
            title = await getTitle(quote5.title_id);
            expect(title.authors).toHaveLength(0);
        });

        describe("and the title's quotes are currently aligned but an update causes them to become unaligned (Part I)", () => {
            beforeAll(() => {
                let quote = {
                    quote: {
                        text: "Test Quote 20",
                        title_id: -1
                    },
                    title: {
                        value: "New Title 16"
                    },
                    authors: [
                        { id: authorIds["New Author 21"], value: "New Author 21" },
                        { id: authorIds["New Author 22"], value: "New Author 22" },
                        { id: authorIds["New Author 23"], value: "New Author 23" }
                    ],
                    tags: []
                };

                return Quote.createQuote(quote)
                .then(async () => {
                    quote = await getQuote("Test Quote 20");

                    const group = [21, 22, 23, 24].map(n => Quote.createQuote({
                        quote: {
                            text: `Test Quote ${n}`,
                            title_id: quote.title_id
                        },
                        title: {
                            id: quote.title_id,
                            value: "New Title 16"
                        },
                        authors: [
                            { id: authorIds["New Author 21"], value: "New Author 21" },
                            { id: authorIds["New Author 22"], value: "New Author 22" },
                            { id: authorIds["New Author 23"], value: "New Author 23" }
                        ],
                        tags: []
                    }));

                    return Promise.all(group);
                });
            });

            let currentTitleId;

            test("where the updated quote comes in with zero authors", async () => {
                let quote1 = {
                    quote: {
                        text: "Test Quote 25",
                        title_id: null
                    },
                    authors: [],
                    tags: []
                };

                await Quote.createQuote(quote1);

                quote1 = await getQuote("Test Quote 25");

                currentTitleId = (await getElemIds(db.Title, [ "New Title 16" ]))["New Title 16"];

                await Quote.updateQuote(quote1.id, {
                    title_id: currentTitleId,
                    title: {
                        id: currentTitleId,
                        value: "New Title 16"
                    },
                    authors: [],
                });

                quote1 = await getQuote("Test Quote 25");
                let title = await getTitle(currentTitleId);

                expect(quote1.title_id).toBe(currentTitleId);
                expect(quote1.authors).toHaveLength(0);
                expect(title.authors).toHaveLength(0);

                [20, 21, 22, 23, 24].map(async n => {
                    let quote = await getQuote(`Test Quote ${n}`);
                    expect(quote.authors).toHaveLength(3);
                });

                await Quote.deleteQuote(quote1.id);
            });

            test("where the updated quote comes in with a subset of the authors", async () => {
                let quote = {
                    quote: {
                        text: "Test Quote 26",
                        title_id: null
                    },
                    authors: [
                        { id: authorIds["New Author 21"], value: "New Author 21" },
                        { id: authorIds["New Author 22"], value: "New Author 22" }
                    ],
                    tags: []
                };

                await Quote.createQuote(quote);

                quote = await getQuote("Test Quote 26");

                await Quote.updateQuote(quote.id, {
                    title_id: currentTitleId,
                    authors: [
                        { id: authorIds["New Author 22"], value: "New Author 22" }
                    ]
                });

                quote = await getQuote("Test Quote 26");
                const title = await getTitle(currentTitleId);

                expect(quote.title_id).toBe(currentTitleId);
                expect(quote.authors).toHaveLength(1);
                expect(title.authors).toHaveLength(0);

                await Quote.deleteQuote(quote.id);
            });

            test("where the updated quote comes in with all the authors + more", async () => {
                let quote = {
                    quote: {
                        text: "Test Quote 27",
                        title_id: null
                    },
                    authors: [
                        { id: -1, value: "New Author 24" }
                    ],
                    tags: []
                };

                await Quote.createQuote(quote);

                authorIds = {
                    ...authorIds,
                    ...(await getElemIds(db.Author, [ "New Author 24" ]))
                };

                quote = await getQuote("Test Quote 27");

                await Quote.updateQuote(quote.id, {
                    title_id: currentTitleId,
                    authors: [21, 22, 23, 24].map(n => ({
                        id: authorIds[`New Author ${n}`],
                        value: `New Author ${n}`
                    }))
                });

                quote = await getQuote("Test Quote 27");
                title = await getTitle(currentTitleId);

                expect(quote.authors).toHaveLength(4);
                expect(quote.title_id).toBe(currentTitleId);
                expect(title.authors).toHaveLength(0);

                await Quote.deleteQuote(quote.id);

                delete authorIds["New Author 24"]; // zombie author
            });

            test("where the updated quote comes in with completely different authors", async () => {
                let quote = {
                    quote: {
                        text: "Test Quote 28",
                        title_id: null
                    },
                    authors: [
                        { id: -1, value: "New Author 24" },
                        { id: -1, value: "New Author 25" }
                    ],
                    tags: []
                };

                await Quote.createQuote(quote);

                authorIds = {
                    ...authorIds,
                    ...(await getElemIds(db.Author, [ "New Author 24", "New Author 25" ]))
                };

                quote = await getQuote("Test Quote 28");

                await Quote.updateQuote(quote.id, {
                    title_id: currentTitleId,
                    authors: [
                        { id: authorIds["New Author 24"], value: "New Author 24" },
                        { id: -1, value: "New Author 26" }
                    ]
                });

                quote = await getQuote("Test Quote 28");
                title = await getTitle(currentTitleId);

                expect(quote.title_id).toBe(currentTitleId);
                expect(quote.authors).toHaveLength(2);
                expect(title.authors).toHaveLength(0);

                await Quote.deleteQuote(quote.id);
            });

            afterEach(async () => { // smallanyana cheating; testing coalescence
                [20, 21, 22, 23, 24].map(async n => {
                    let quote = await getQuote(`Test Quote ${n}`);
                    expect(quote.authors).toHaveLength(0);
                });

                const title = await getTitle(currentTitleId)
                expect(title.authors).toHaveLength(3);
            });
        });

        // describe("and the title's quotes are currently aligned but an update causes them to become unaligned (Part II)", () => {
        //     beforeAll(() => {
        //         let quote = {
        //             quote: {
        //                 text: "Test Quote 29",
        //                 title_id: -1
        //             },
        //             title: {
        //                 value: "New Title 17"
        //             },
        //             authors: [],
        //             tags: []
        //         };

        //         return Quote.createQuote(quote)
        //         .then(async () => {
        //             quote = await getQuote("Test Quote 29");

        //             const group = [30, 31].map(n => Quote.createQuote({
        //                 quote: {
        //                     text: `Test Quote ${n}`,
        //                     title_id: quote.title_id
        //                 },
        //                 title: {
        //                     id: quote.title_id,
        //                     value: "New Title 17"
        //                 },
        //                 authors: [],
        //                 tags: []
        //             }));

        //             return Promise.all(group);
        //         });
        //     });

        //     test("")
        // });
    });
});

afterAll(() => {
    return knex.destroy();
});

