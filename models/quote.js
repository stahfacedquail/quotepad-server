const { Tag, Title, TitleAuthor } = require("../db/main");

const NUM_RECENT_QUOTES = 5;

const findQuoteById = (req, res) => {
    if(req.query) {
        if(req.query.full)
            return getQuoteWithAllAttributes(req, res);
    }

    new db.Quote({ id: req.params.id }).fetch({ require: false })
    .then(quote => {
        res.send(quote ? quote.toJSON() : null);
    });
};

const getQuoteWithAllAttributes = (req, res) => {
    let _returnObj = {};

    new db.Quote({ id: req.params.id }).fetch({ require: false, withRelated: [ "title", "tags" ] })
    .then(quote => {
        if(quote == null)  {
            _returnObj = null;
            return new Promise(resolve => resolve(null));
        }

        Object.assign(_returnObj, quote.toJSON());
        
        if(quote.related("title")) {
            return new db.Title({ id: quote.related("title").get("id") })
                .fetch({ require: false, withRelated: [ "type", "authors" ]});
        }
        
        return new Promise(resolve => resolve(null));
    })
    .then(titleWithTypeAndAuthors => {
        if(titleWithTypeAndAuthors) {
            _returnObj.title.type = titleWithTypeAndAuthors.related("type").toJSON();

            _returnObj.authors = titleWithTypeAndAuthors.related("authors").toJSON();
        }
            
        res.send(_returnObj);
    })
    .catch(error => {
        res.send(error);
    })
};

const getQuotes = (req, res) => {
    let getQuotesPromise;

    if(req.query.recent)
        getQuotesPromise = new db.Quotes()
            .orderBy("date_added", "DESC")
            .query(qb => qb.limit(NUM_RECENT_QUOTES))
            .fetch();
        
    else if(req.query.favourite)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ is_favourite: true }))
            .fetch();
    
    else if(req.query.titleId)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ title_id: req.query.titleId }))
            .fetch();

    else
        getQuotesPromise = new db.Quotes().fetch();

    getQuotesPromise
    .then(quotes => res.send(quotes.toJSON()))
    .catch(error => res.send(error));
};

const updateQuote = (req, res) => {
    let updates = {};
    console.log(req);

    if("is_favourite" in req.body)
        updates.is_favourite = req.body.is_favourite instanceof Boolean ? req.body.is_favourite : new Boolean(req.body.is_favourite);

    new db.Quote({ id: req.params.id }).save(updates)
    .then(updatedModel => res.send(updatedModel.toJSON()))
    .catch(error => res.send(error));
};

const deleteQuote = (req, res) => {
    //delete quote-tags
    //search for zombie tags and delete
    //delete quote
    //ascertain whether zombie title then delete corresponding title-author entries
    //then delete title
    //search for zombie authors and delete

    let quoteToBeDeleted;
    let returnObj = {
        success: true,
        lastQuoteInTitle: false
    };

    new db.Quote({ id: req.params.id }).fetch()
    .then(obj => quoteToBeDeleted = obj.toJSON())
    .then(() => {
        return bookshelf.transaction(t => {
            return new db.QuoteTag()
            .where({ quote_id: req.params.id })
            .destroy({ transacting: t, require: false })
            .then(() => {
                return knex.raw(
                    "SELECT tag_id from quote_tags " +
                    "WHERE tag_id IN (" +
                        "SELECT quote_tags.tag_id " +
                        "FROM tags LEFT JOIN quote_tags " +
                        "ON tags.id = quote_tags.tag_id " +
                        "GROUP BY quote_tags.tag_id " +
                        "HAVING COUNT(quote_tags.tag_id) = 1" +
                    `) AND quote_id = ${req.params.id};`
                );
            })
            .then(quotelessTags => {
                quotelessTags = quotelessTags.rows;

                if(quotelessTags.length == 0)
                    return new Promise(resolve => resolve(null));

                quotelessTags = quotelessTags.map(tag =>
                    new db.Tag()
                    .where({ id: tag.tag_id })
                    .destroy({ transacting: t })
                );

                return Promise.all(quotelessTags);
            })
            .then(() => {
                return new db.Quote()
                .where({ id: req.params.id })
                .destroy({ transacting: t });
            })
            .then(() => {
                return new db.Quote()
                .where({ title_id: quoteToBeDeleted.title_id })
                .count("id");
            })
            .then(numQuotesInTitle => {
                console.log(`Number of quotes in title ${quoteToBeDeleted.title_id}`, numQuotesInTitle);

                if(numQuotesInTitle == 1) {
                    returnObj.lastQuoteInTitle = true;

                    return new db.TitleAuthor()
                        .where({ title_id: quoteToBeDeleted.title_id })
                        .destroy({ transacting: t})
                        .then(() => {
                            return new Title({ id: quoteToBeDeleted.title_id }).destroy({ transacting: t});
                        });
                }

                return new Promise(resolve => resolve(null));
            })
            .then(titleDeleted => {
                if(titleDeleted) {
                    return knex.raw(
                        "SELECT author_id FROM title_authors " +
                        "WHERE author_id IN (" +
                            "SELECT title_authors.author_id " +
                            "FROM authors LEFT JOIN title_authors " +
                            "ON authors.id = title_authors.author_id " +
                            "GROUP BY title_authors.author_id " +
                            "HAVING COUNT(title_authors.author_id) = 1" +
                        `) AND title_id = ${quoteToBeDeleted.title_id}`
                    );
                }

                return new Promise(resolve => resolve(null));
            })
            .then((titlelessAuthors) => {
                if(titlelessAuthors && titlelessAuthors.rows.length > 0) {
                    titlelessAuthors = titlelessAuthors.rows.map(author =>
                        new db.Author()
                        .where({ id: author.author_id })
                        .destroy({ transacting: t})
                    );

                    return Promise.all(titlelessAuthors);
                } 
                
                return new Promise(resolve => resolve(null));
            });
        });
    })
    .then(() => {
        res.send(returnObj);
    })
    .catch(error => {
        console.log("ERROR!", error);
        returnObj.success = false;
        returnObj.error = error;
        res.send(returnObj);
    });
};

const createQuote = (req, res) => {
    /*  INCOMING:
        let postObj = {
        quote: {
          text: this.quoteText,
          title_id: "id" in this.chosenTitle ? this.chosenTitle.id : null
        },
        title: {
          value: "value" in this.chosenTitle && this.chosenTitle.value.trim().length > 0 ? this.chosenTitle.value : null,
          type_id: "id" in this.chosenType ? this.chosenType.id : null
        },
        authors: this.chosenAuthors,
        tags: this.chosenTags
        -- Each author/tag: { id: ...., value: .... }
      }; ----> MODIFY to bring -1 instead of nulls for title, author and tag ids
    */

    //create non-existent title
    //assign title id to quote
    //create non-existent author(s)
    //if new title: create title-author relationships
    //else: create if new author added, delete if old author removed
    //create quote
    //OUTSTANDING: create non-existent tag(s)
    //OUTSTANDING: create quote-tag relationships

    bookshelf.transaction(t => {
        return new Promise((resolve, reject) => {
            if(req.body.quote.title_id >= 0) {
                console.log("Existing title; on to the next step");
                return resolve(null);
            }

            console.log("Title does not exist yet; create");

            let titleObj = {};
            titleObj.value = req.body.title.value;
            if(req.body.title.type_id)
                titleObj.type_id = req.body.title.type_id;

            new db.Title().save(titleObj, { transacting: t })
            .then(newTitle => resolve(newTitle.get("id")))
            .catch(error => reject(error));
        })
        .then(newTitleId => {
            console.log(newTitleId ? `Title ${newTitleId} created!` : "We are in the next step!");
            if(newTitleId)
                req.body.title.id = newTitleId;
            
            let newAuthors = req.body.authors.filter(author => author.id == -1);
            console.log("Create new author entries", newAuthors);
            return Promise.all(
                newAuthors.map(newAuthor => new db.Author().save({ value: newAuthor.value }, { transacting: t }))
            );
        })
        .then(newAuthors => {
            console.log(`${newAuthors.length} new authors created`);
            newAuthors = newAuthors.map(newAuthor => newAuthor.get("id"));

            req.body.authors = req.body.authors.filter(author => author.id >= 0).map(author => author.id);
            req.body.authors = req.body.authors.concat(newAuthors);
            console.log("New and improved list of authors", req.body.authors);

            if(req.body.quote.title_id >= 0) { //title existed before
                //so if there are authors listed in the request but not on the db, create those relationships
                //and if there are authors listed on the db who aren't on the request, delete those relationships
                console.log("Because it's an already existing title, it's time to tango!");
                return new db.TitleAuthors()
                .where({ title_id: req.body.quote.title_id })
                .fetch()
                .then(titleAuthors => {
                    titleAuthors = titleAuthors.toJSON();
                    let existingAuthors = titleAuthors.map(titleAuthor => titleAuthor.author_id);
                    
                    //add: authors who appear in the incoming request but aren't in the db
                    let authorsToAdd = req.body.authors.filter(author => !(existingAuthors.includes(author)));
                    //delete: authors who appear in the db but not in the incoming request
                    let authorsToRemove = existingAuthors.filter(author => !(req.body.authors.includes(author)));

                    console.log("Authors to add", authorsToAdd);
                    console.log("Authors to remove", authorsToRemove);

                    return Promise.all([
                        authorsToAdd.map(author => new db.TitleAuthor().save({
                            title_id: req.body.quote.title_id,
                            author_id: author
                        }, { transacting: t })),

                        authorsToRemove.map(author => new db.TitleAuthor().where({
                            title_id: req.body.quote.title_id,
                            author_id: author
                        }).destroy({ transacting: t }))
                    ]);
                })
            } else { //new title
                //so just create the new title/author relationships
                console.log("It's a brand new title, so let's set up some brand new relationships");
                return Promise.all(
                    req.body.authors.map(
                        author => new db.TitleAuthor().save({
                            title_id: req.body.title.id,
                            author_id: author
                        }, { transacting: t })
                    )
                );
            }
        })
        .then(() => {
            console.log("Nice!  And now for the biz de la biz: creating the quote!");
            return new db.Quote().save({
                text: req.body.quote.text,
                title_id: req.body.title.id || req.body.quote.title_id,
                date_added: new Date()
            }, { transacting: t });
        })
        .then(newQuote => {
            console.log("Quote creation done :)", newQuote.toJSON());
            res.send(newQuote.toJSON());
        })
        .catch(error => {
            console.log("ERROR!", error);
            res.send(error);
        });
    });
    
};

module.exports = {
    findQuoteById,
    getQuotes,
    updateQuote,
    deleteQuote,
    createQuote
};