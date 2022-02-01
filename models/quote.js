const Title = require("./title.js");
const Author = require("./author.js");
const Tag = require("./tag.js");
const utils = require("../db/util.js");

const NUM_RECENT_QUOTES = 5;

const processCreateQuoteRequest = (req, res) => {
    createQuote(req.body)
    .then(() => {
        res.status(200).send("All good :)");
    })
    .catch(error => {
        res.status(500).send(error);
    });
};

const processDeleteQuoteRequest = (req, res) => {
    deleteQuote(req.params.id)
    .then(returnObj => {
        res.status(200).send(returnObj);
    })
    .catch(error => {
        res.status(500).send({
            success: false,
            error: error
        });
    });
};

const processUpdateQuoteRequest = (req, res) => {
    let updateProcess;
    if(is_favourite in req.body) {
        updateProcess = updateIsFavourite(req.params.id, req.body.is_favourite);
    } else
        updateProcess = updateQuote(req.params.id, req.body);

    updateProcess
    .then(updatedModel => res.send(updatedModel.toJSON()))
    .catch(error => {
        res.send(error)
    });
};

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
    let returnQuote = {};

    new db.Quote({ id: req.params.id }).fetch({ require: false, withRelated: [ "title", "authors", "tags" ] })
    .then(quote => {
        if(quote == null)  {
            returnQuote = null;
            return new Promise(resolve => resolve(null));
        }

        quote = quote.toJSON();
        returnQuote = quote;
        
        if(quote.title) {
            let relatedAttrs = [ "type" ];

            if(quote.authors.length == 0)
                relatedAttrs.push("authors"); //the quote does not have author relationships, but maybe its title does
            
            return new db.Title({ id: quote.title.id })
                    .fetch({ require: false, withRelated: relatedAttrs });
        } else {
            return new Promise(resolve => resolve(null));
        }
    })
    .then(titleWithTypeAndAuthors => {
        if(titleWithTypeAndAuthors) {
            titleWithTypeAndAuthors = titleWithTypeAndAuthors.toJSON();
            returnQuote.title.type = titleWithTypeAndAuthors.type;
            returnQuote.authors = returnQuote.authors.length == 0 ? titleWithTypeAndAuthors.authors : returnQuote.authors;
        }
        else {
            returnQuote.title = null;
        }
            
        res.send(returnQuote);
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
    .catch(error => {
        res.send(error);
    });
};

const updateIsFavourite = (quoteId, fav) => {
    return new db.Quote({ id: quoteId }).save({
        is_favourite: fav
    });
};

const updateQuote = (quoteId, qtUpdates) => {
    //scenarios:
    //--------------------------------
    //1. update is_favourite (quote) [always happens in isolation]
    //2. update text (quote)
    //3. update title
    //4. update author(s) - all relative to the "new" title, if any
    //5. update title type
    //6. update tags - replace current with new and get rid of zombies

    return bookshelf.transaction(t => {
        let quoteUpdates = {};
        let originalQuote;
        
        if("text" in qtUpdates)
            quoteUpdates.text = qtUpdates.text;
        
        let createTitle;
        if("title_id" in qtUpdates) {
            if(qtUpdates.title_id == null || qtUpdates.title_id >= 0) //remove quote from title or assign quote to a different existing title
                quoteUpdates.title_id = qtUpdates.title_id;
            else { //this is a new title that needs to be created
                createTitle = Title.createTitle({
                    value: qtUpdates.title.value,
                    type_id: qtUpdates.title.type_id
                }, t).then(newTitle => {
                    qtUpdates.title_id = newTitle.get("id");
                    quoteUpdates.title_id = newTitle.get("id");
                });
            }
        }

        let createAuthors;
        if("authors" in qtUpdates) {
            let newAuthors = qtUpdates.authors.filter(author => author.id == -1);
            if(newAuthors.length > 0)
                createAuthors = Author.createAuthors(newAuthors, t).then(authors => {
                    newAuthors = authors.map(author => author.toJSON());
                    qtUpdates.authors = qtUpdates.authors.filter(author => author.id >= 0).concat(newAuthors).map(author => author.id);
                });
            else
                qtUpdates.authors = qtUpdates.authors.map(author => author.id);
        }

        let getOriginalQuote = new db.Quote({
            id: quoteId
        }).fetch()
        .then(quote => originalQuote = quote.toJSON());

        let numQuoteAuthors = new db.QuoteAuthor().where({ quote_id: quoteId }).count().then(num => {
            numQuoteAuthors = num;
        });

        return Promise.all([
            getOriginalQuote,
            numQuoteAuthors,
            createAuthors || Promise.resolve(null),
            createTitle || Promise.resolve(null),
        ]).then(() => {
            //Different combinations of title_id supplied/not supplied and author changes supplied/not supplied dictate different responses

            if("title_id" in qtUpdates) { //Title changed
                if(qtUpdates.title_id == null) { //Title removed
                    if("authors" in qtUpdates) { //... and authors were changed
                        //delete existing quote/author entries, if any
                        //If there are no quote/author entries, maybe there are authors who belonged to its former title
                        //in which case, the cleaning up will happen if it turns out the title is now a zombie title 
                        return utils.deleteMultiple(
                            new db.QuoteAuthors().where({ quote_id: quoteId }),
                            db.QuoteAuthor,
                            t
                        )
                        .then(() => {
                            //create new quote/author entries
                            return qtUpdates.authors.map(
                                authorId => createQuoteAuthorEntry(quoteId, authorId, t)
                            );                        
                        });
                    } else { //Title removed, but no author changes were made
                        //If the title has authors, assign the authors to the quote... if the quote doesn't already have authors!
                        if(numQuoteAuthors == 0)
                            return new db.TitleAuthors()
                            .where({ title_id: originalQuote.title_id })
                            .fetch()
                            .then(titleAuthors => {
                                return Promise.all(titleAuthors.toJSON().map(
                                    titleAuth => createQuoteAuthorEntry(quoteId, titleAuth.author_id, t)
                                ));
                            });
                        
                        return new Promise(resolve => resolve(null));
                    }
                } else { //Title changed to sth new/existing
                    //Authors must be sent by default, whether empty or changed or same as old
                    //If the former title has authors associated with it, clean up will happen when we look for zombies
                    //If the current title has authors associated with it, the function below will compare the authors sent with
                    //the ones on db and if they match, no further changes
                    //But if they don't, then it will change the title/author associations into quote/author associations
                    //If the quote had authors associated with it, we need to remove those and then create relationships with authors anew
                    
                    let removeOldQuoteAuthorAssociations = Promise.resolve(null);
                    if(numQuoteAuthors > 0)
                        removeOldQuoteAuthorAssociations = utils.deleteMultiple(
                            new db.QuoteAuthors().where({ quote_id: quoteId }),
                            db.QuoteAuthor,
                            t
                        );
                    
                    return removeOldQuoteAuthorAssociations.then(() => {
                        if(createTitle) //if this quote now belongs to a newly-created title, create title/author associations
                            return Promise.all(qtUpdates.authors.map(author =>
                                new db.TitleAuthor().save({
                                    title_id: qtUpdates.title_id,
                                    author_id: author
                                }, { transacting: t })
                            ));
                        else //otherwise, look and see if incoming authors match the new title's authors, then create quote/author associations if need be
                            return createQuoteBelongingRelationship(quoteId, qtUpdates.title_id, qtUpdates.authors, t);
                    });
                }
            } else { //Title unchanged
                //Were author changes made?
                if("authors" in qtUpdates) {
                    return Promise.resolve(true)
                    .then(() => {
                        if(numQuoteAuthors > 0) {
                            return util.deleteMultiple(
                                new db.QuoteAuthors().where({ quote_id: quoteId }),
                                db.QuoteAuthor,
                                t
                            );
                        }

                        return Promise.resolve(null);
                    })
                    .then(() => {
                        return createQuoteBelongingRelationship(quoteId, originalQuote.title_id, qtUpdates.authors, t)
                    })
                    .then(() => {
                        if(! createTitle) {
                            //Maybe in updating the authors, all the quotes in this title now have the same authors?
                            return checkIfQuoteAuthorsInTitleAlign(qtUpdates.title_id, t);
                        }
                    })
                    .then(theyAlign => {
                        if(theyAlign)
                            return coalesceQuoteAuthorIntoTitleAuthorAssociation(t, qtUpdates.title_id, qtUpdates.authors);
        
                        //else: the quotes have different authors to each other;
                        //keep the relationships as quote/author relationships
                    });
                } else {
                    //No author updates; nothing further to be done
                }
            }
        }).then(() => {
            if(originalQuote.title_id) {
                //Is the previous title a zombie title?
                return checkIfLastQuoteInTitle(originalQuote.title_id)
                .then(itWasTheLastQuoteInFormerTitle => {
                    if(itWasTheLastQuoteInFormerTitle)
                        return Title.deleteTitle(originalQuote.title_id, t)
                    else //maybe it isn't a zombie title, but let's check if the quotes in it now align
                        return checkIfQuoteAuthorsInTitleAlign(originalQuote.title_id, t)
                        .then(theyAlign => {
                            if(theyAlign)
                                return coalesceQuoteAuthorIntoTitleAuthorAssociation(t, originalQuote.title_id);
                            else
                                return Promise.resolve(null);
                        })
                });
            }

            return Promise.resolve(null);
        }).then(() => {
            return Author.cleanUpZombieAuthors(t);
        }).then(() => {
            if("tags" in qtUpdates)
                return createQuoteTagRelationships(quoteId, qtUpdates.tags, t, true);
        }).then(() => {
            if(Object.keys(quoteUpdates).length > 0)
                return new db.Quote({ id: quoteId }).save(quoteUpdates, { transacting: t });
        });
    });
};

const deleteQuote = quoteId => {
    //delete quote-tags
    //search for zombie tags and delete
    //delete quote-authors
    //delete quote
    //is this title a zombie title? delete corresponding title-author entries
    //then delete zombie title
    //search for zombie authors and delete

    let quoteToBeDeleted;
    let returnObj = {
        success: true,
        lastQuoteInTitle: false
    };

    return new db.Quote({ id: quoteId }).fetch()
    .then(obj => {
        quoteToBeDeleted = obj.toJSON()
    })
    .then(() => {
        return bookshelf.transaction(t => {
            return utils.deleteMultiple(
                new db.QuoteTags().where({ quote_id: quoteId }),
                db.QuoteTag,
                t
            )
            .then(() => {
                return Tag.cleanUpZombieTags(t);
            })
            .then(() => {
                return utils.deleteMultiple(
                    new db.QuoteAuthors().where({ quote_id: quoteId }),
                    db.QuoteAuthor,
                    t
                );
            })
            .then(() => {
                return new db.Quote()
                    .where({ id: quoteId })
                    .destroy({ transacting: t });
            })
            .then(() => {
                if(quoteToBeDeleted.title_id)
                    return checkIfLastQuoteInTitle(quoteToBeDeleted.title_id)
                else
                    return Promise.resolve(null);
            })
            .then(isLastQuoteInTitle => {
                if(isLastQuoteInTitle) {
                    returnObj.lastQuoteInTitle = true;
        
                    return Title.deleteTitle(quoteToBeDeleted.title_id, t);
                } else if(quoteToBeDeleted.title_id) {
                    //this quote belonged to a title and there are other quotes in this title, and maybe in removing the quote,
                    //we have removed the delinquent and now the rest of the quotes in this title have matching authors
                    return checkIfQuoteAuthorsInTitleAlign(quoteToBeDeleted.title_id, t)
                    .then(theyAlign => {
                        if(theyAlign) {
                            return coalesceQuoteAuthorIntoTitleAuthorAssociation(t, quoteToBeDeleted.title_id);
                        } else {
                            return Promise.resolve(null);
                        }
                    });
                }

                return Promise.resolve(null);
            })
            .then(() => {
                return Author.cleanUpZombieAuthors(t);
            })
            .then(() => {
                return Promise.resolve(returnObj);
            });
        });
    });
};

const createQuote = details => {
    return bookshelf.transaction(t => {
        return new Promise((resolve, reject) => {
            if(details.quote.title_id == null) {
                return resolve(null);
            }

            if(details.quote.title_id >= 0) {
                return resolve(details.quote.title_id);
            }

            let titleObj = {};
            titleObj.value = details.title.value;
            if(details.title.type_id)
                titleObj.type_id = details.title.type_id;

            Title.createTitle(titleObj, t)
            .then(newTitle => resolve(newTitle.get("id")))
            .catch(error => reject(error));
        })
        .then(titleId => {
            if(details.title)
                details.title.id = titleId;
            else
                details.title = {
                    id: titleId
                };
            
            return new db.Quote().save({
                text: details.quote.text,
                title_id: details.title.id,
                date_added: new Date()
            }, { transacting: t });
        })
        .then(newQuote => {
            newQuote = newQuote.toJSON();
            details.quote.id = newQuote.id;

            let newAuthors = details.authors.filter(author => author.id == -1);
            return Author.createAuthors(newAuthors, t);
        })
        .then(newAuthors => {
            newAuthors = newAuthors.map(newAuthor => newAuthor.get("id"));

            details.authors = details.authors.filter(author => author.id >= 0).map(author => author.id);
            details.authors = details.authors.concat(newAuthors);

            return createQuoteBelongingRelationship(details.quote.id, details.title.id, details.authors, t, details.quote.title_id == -1)
        })
        .then(() => {
            return createQuoteTagRelationships(details.quote.id, details.tags, t);
        });
    });
    
};

const checkIfLastQuoteInTitle = titleId => {
    return new Promise(resolve => {
        new db.Quote()
            .where({ title_id: titleId })
        .count("id")
        .then(numQuotesInTitle => {
            if(numQuotesInTitle == 1)
                resolve(true);
            else
                resolve(false);
        });
    });
};

const createQuoteAuthorEntry = (quoteId, authorId, trx) => {
    return new db.QuoteAuthor()
    .save({
        quote_id: quoteId,
        author_id: authorId
    }, { transacting: trx });
};

const createQuoteBelongingRelationship = (quoteId, titleId, incomingAuthors, trx, isNewTitle = false) => {
    if(titleId == null) {
        //create QuoteAuthor relationships
        return Promise.all(incomingAuthors.map(
            authorId => createQuoteAuthorEntry(quoteId, authorId, trx)
        ));
    }

    //1. if there are new authors [for this title], delete all title-author relationships for this title
    //and allocate those authors to the existing quotes in the title
    //2. create quote-author relationships for new quote
    return new db.TitleAuthors()
    .where({ title_id: titleId })
    .orderBy("author_id", "ASC")
    .fetch()
    .then(titleAuthors => {
        if(titleAuthors.length > 0) { //There are authors associated with the title
            titleAuthors = titleAuthors.toJSON();
            let existingAuthors = titleAuthors.map(titleAuthor => titleAuthor.author_id);
            let authorListsMatch = true;
            
            //Does the list of authors received match the list of existing authors?
            if(existingAuthors.length == incomingAuthors.length) {
                incomingAuthors.sort((authorX, authorY) => {
                    if(authorX > authorY) return 1;
                    if(authorX < authorY) return -1;
                    return 0;
                });

                for(let i = 0; authorListsMatch && i < existingAuthors.length; i++)
                    if(existingAuthors[i] != incomingAuthors[i])
                        authorListsMatch = false;
            } else {
                authorListsMatch = false;
            }

            if(authorListsMatch) {
                //no changes to be made here
                return new Promise(resolve => resolve([]));
            } else {
                //1. Fetch quotes under this title_id and create quote-author relationships using the existing authors for this title
                //2. Delete all title-author relationships for this title
                //3. Create quote-author relationship for new quote using req.body.authors
                return new db.Quotes()
                    .where({ title_id: titleId })
                .fetch({ columns: "id" })
                .then(quotesInThisTitle => {
                    quotesInThisTitle = quotesInThisTitle.toJSON();

                    let quoteAuthorRelationships = [];
                    for(let i = 0; i < existingAuthors.length; i++)
                        quoteAuthorRelationships = quoteAuthorRelationships.concat(quotesInThisTitle.map(
                            quote => createQuoteAuthorEntry(quote.id, existingAuthors[i], trx)
                        ));

                    return Promise.all(quoteAuthorRelationships);
                })
                .then(() => {
                    return utils.deleteMultiple(
                        new db.TitleAuthors().where({ title_id: titleId }),
                        db.TitleAuthor,
                        trx
                    );
                })
                .then(() => {
                    return Promise.all(incomingAuthors.map(
                        authorId => createQuoteAuthorEntry(quoteId, authorId, trx)
                    ));
                });
            }
        } else { //no authors associated with the title
            //if it's a new title, create title/author relationships
            //else, create quote/author relationships
            return Promise.resolve(true)
            .then(() => {
                if(isNewTitle)
                    return Promise.all(incomingAuthors.map(
                        authorId => new db.TitleAuthor().save({
                            title_id: titleId,
                            author_id: authorId
                        }, { transacting: trx })
                    ));
                else
                    return Promise.all(incomingAuthors.map(
                        authorId => createQuoteAuthorEntry(quoteId, authorId, trx)
                    ));
            });
        }
    });
};

const createQuoteTagRelationships = (quoteId, tags, trx, replace = false) => {
    return new Promise(resolve => {
        if(replace) { //this is an update; remove all current quote/tag associations and replace with incoming ones
            utils.deleteMultiple(
                new db.QuoteTags().where({ quote_id: quoteId }),
                db.QuoteTag,
                trx
            )
            .then(() => resolve(null));
        } else resolve(null);
    }).then(() => { //create new tags
        return Promise.all(tags.filter(tag => tag.id == -1).map(
            tag => Tag.createTag(tag, trx)
        ));
    }).then(newTags => {
        newTags = newTags.map(tag => {
            return {
                quote_id: quoteId,
                tag_id: tag.get("id")
            };
        });

        let tagsToAssociateWithQuote = tags.filter(tag => tag.id >= 0).map(tag => { 
            return {
                quote_id: quoteId,
                tag_id: tag.id 
            }
        });
        tagsToAssociateWithQuote = tagsToAssociateWithQuote.concat(newTags);

        return Promise.all(tagsToAssociateWithQuote.map(
            tag => new db.QuoteTag().save(tag, { transacting: trx })
        ));
    }).then(() => {
        if(replace) //this wasn't a quote creation op; it was an update and some tags might have lost relevance
            return Tag.cleanUpZombieTags(trx);
    });
};

const checkIfQuoteAuthorsInTitleAlign = (titleId, trx) => {
    //1. make sure the title doesn't have authors linked to it (as opposed to linked to the quotes)
    //2. the process is unnecessary if the quotes have 0 authors in total (only checking for this in the coalescing function)
    return trx.raw(
        `SELECT SUM(num_quote_authors) AS sum_quote_authors, SUM(total_num_title_authors) AS product_quote_nums_title_authors
        FROM	(	SELECT quotes.id, quotes.title_id, COUNT(quote_authors.author_id) as num_quote_authors
                    FROM quotes LEFT JOIN quote_authors
                    ON quotes.id = quote_authors.quote_id
                     WHERE quotes.title_id = ?
                    GROUP BY quotes.id
                ) AS quote_author_counts
                INNER JOIN
                (	SELECT author_owning_quotes.title_id, COUNT(DISTINCT quote_authors.author_id) AS total_num_title_authors
                     FROM	(	SELECT quotes.id, quotes.title_id
                                 FROM quotes
                                 WHERE quotes.title_id NOT IN ( SELECT title_id FROM title_authors )
                                 AND quotes.title_id = ?
                            ) AS author_owning_quotes
             
                            INNER JOIN quote_authors
                            ON author_owning_quotes.id = quote_authors.quote_id
                    GROUP BY author_owning_quotes.title_id
                ) AS title_author_counts
        ON quote_author_counts.title_id = title_author_counts.title_id
        GROUP BY quote_author_counts.title_id;`, [ titleId, titleId ]
    )
    .then(result => {
        return Promise.resolve(result.rows.length > 0 ?
            result.rows[0].sum_quote_authors == result.rows[0].product_quote_nums_title_authors : false);
        //if the query doesn't return rows, there was some disqualification - maybe the title has authors
        //associated with it directly.  In this case, return false -- the authors "don't align", i.e. don't
        //change anything.  But if the authors do align, then yes, raise the flag for a coalescence to happen
    });
};

const coalesceQuoteAuthorIntoTitleAuthorAssociation = (trx, titleId, authors) => {
    return new Promise((resolve, reject) => {
        if(authors)
            resolve(authors);
        else {
            //fetch existing authors for this title from db
            trx.raw(
                "SELECT DISTINCT author_id " +
                "FROM quotes INNER JOIN quote_authors " +
                "ON quotes.id = quote_authors.quote_id " +
                "WHERE quotes.title_id = ?;",
            [ titleId ])
            .then(authors => {
                resolve(authors.rows.map(author => author.author_id));
            })
            .catch(error => reject(error));
        }
    })
    .then(async incomingAuthors => {
        if(incomingAuthors.length > 0) {
            let quotes = await new db.Quotes()
                .where({ title_id: titleId })
                .fetch({ columns: "id", transacting: trx });
        
            let destroyQuoteAuthor = quotes.toJSON().map(quote =>
                utils.deleteMultiple(
                    new db.QuoteAuthors().where({ quote_id: quote.id }),
                    db.QuoteAuthor,
                    trx
                )
            );

            let createTitleAuthor = incomingAuthors.map(authorId => new db.TitleAuthor().save({
                title_id: titleId,
                author_id: authorId
            }, { transacting: trx }));

            return Promise.all([
                Promise.all(destroyQuoteAuthor),
                Promise.all(createTitleAuthor)
            ]);
        } 
        
        return Promise.resolve(null);
    });
};

module.exports = {
    findQuoteById,
    getQuotes,
    processCreateQuoteRequest,
    processDeleteQuoteRequest,
    processUpdateQuoteRequest,

    //for testing
    createQuote,
    deleteQuote,
    updateQuote,
    updateIsFavourite
};