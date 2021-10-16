const pg = require("knex")({
    client: 'pg',
    connection: process.env.DATABASE_URL
});

global.knex = pg;

const bookshelf = require("bookshelf")(pg);

global.bookshelf = bookshelf;

const TitleType = bookshelf.model("TitleType", {
    tableName: "title_types"
});

const TitleTypes = bookshelf.collection("TitleTypes", {
    model: TitleType
});

const Author = bookshelf.model("Author", {
    tableName: "authors"
});

const Authors = bookshelf.collection("Authors", {
    model: Author
});

const Tag = bookshelf.model("Tag", {
    tableName: "tags"
});

const Tags = bookshelf.collection("Tags", {
    model: Tag
});

const Title = bookshelf.model("Title", {
    tableName: "titles",
    type() {
        return this.belongsTo("TitleType", "type_id");
    },
    authors() {
        return this.belongsToMany("Author", "title_authors");
    }
});

const Titles = bookshelf.collection("Titles", {
    model: Title
});

const Quote = bookshelf.model("Quote", {
    tableName: "quotes",
    title() {
        return this.belongsTo("Title");
    },
    tags() {
        return this.belongsToMany("Tag", "quote_tags");
    }
});

const Quotes = bookshelf.collection("Quotes", {
    model: Quote
});

const QuoteTag = bookshelf.model("QuoteTag", {
    tableName: "quote_tags"
});

const TitleAuthor = bookshelf.model("TitleAuthor", {
    tableName: "title_authors"
});

module.exports = {
    TitleType,
    TitleTypes,
    Author,
    Authors,
    Title,
    Titles,
    Tag,
    Tags,
    Quote,
    Quotes,
    QuoteTag,
    TitleAuthor,

    transaction: bookshelf.transaction
};
