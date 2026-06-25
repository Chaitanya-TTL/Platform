//==================================================
//
//  Copyright 2022 Siemens Digital Industries Software
//
//==================================================

package com.teamcenter.clientx;


import com.teamcenter.soa.client.model.ModelEventListener;
import com.teamcenter.soa.client.model.ModelObject;
import com.teamcenter.soa.exceptions.NotLoadedException;

/**
 * Implementation of the ChangeListener. Suppress object change notifications as they are
 * internal Teamcenter operations not relevant to the ETL pipeline output.
 *
 */
public class AppXModelEventListener extends ModelEventListener
{

    @Override
    public void localObjectChange(ModelObject[] objects)
    {
        // Suppress verbose object change logging - internal Teamcenter operations only
        // This reduces console noise from BOMWindow creation and other background operations
    }

    @Override
    public void localObjectDelete(String[] uids)
    {
        // Suppress verbose object deletion logging - internal Teamcenter operations only
        // This reduces console noise from BOMWindow cleanup and other background operations
    }

}
